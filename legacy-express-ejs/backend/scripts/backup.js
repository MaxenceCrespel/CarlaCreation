#!/usr/bin/env node
// Backs up the SQLite database and uploaded photos into a single timestamped
// archive. Run manually (`npm run backup`) or from a cron job:
//   0 3 * * * cd /path/to/backend && node scripts/backup.js >> /var/log/carla-backup.log 2>&1
//
// Uses better-sqlite3's built-in backup API (not a raw file copy) so the
// snapshot is consistent even if the server is writing concurrently.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const Database = require('better-sqlite3');

const BACKEND_DIR = path.join(__dirname, '..');
const DB_PATH = path.join(BACKEND_DIR, 'data', 'salon.db');
const UPLOADS_DIR = path.join(BACKEND_DIR, 'uploads');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(BACKEND_DIR, 'backups');
const KEEP_LAST = 14;

if (!fs.existsSync(DB_PATH)) {
  console.error(`No database found at ${DB_PATH} — nothing to back up.`);
  process.exit(1);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const stagingDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'salon-backup-'));
const dbSnapshotPath = path.join(stagingDir, 'salon.db');

async function main() {
  const db = new Database(DB_PATH, { readonly: true });
  await db.backup(dbSnapshotPath);
  db.close();

  const archivePath = path.join(BACKUP_DIR, `salon-backup-${timestamp}.tar.gz`);

  // Bundle the DB snapshot alongside the uploads directory.
  const tarArgs = ['-czf', archivePath, '-C', stagingDir, 'salon.db'];
  if (fs.existsSync(UPLOADS_DIR)) {
    tarArgs.push('-C', BACKEND_DIR, 'uploads');
  }
  execFileSync('tar', tarArgs);

  fs.rmSync(stagingDir, { recursive: true, force: true });
  console.log(`Backup written to ${archivePath}`);

  pruneOldBackups();
}

function pruneOldBackups() {
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('salon-backup-') && f.endsWith('.tar.gz'))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  files.slice(KEEP_LAST).forEach((f) => {
    fs.unlinkSync(path.join(BACKUP_DIR, f.name));
    console.log(`Removed old backup: ${f.name}`);
  });
}

main().catch((err) => {
  fs.rmSync(stagingDir, { recursive: true, force: true });
  console.error('Backup failed:', err);
  process.exit(1);
});
