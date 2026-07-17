#!/usr/bin/env ts-node
// Backs up the Postgres database into a single timestamped, gzipped dump.
// Run manually (`npm run backup`) or from a cron job. Superseded in
// production by Supabase's (or whichever host's) built-in automated
// backups where available — this remains as a simple manual/local option.
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { execFileSync } from 'child_process';

const API_DIR = path.join(__dirname, '..');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(API_DIR, 'backups');
const KEEP_LAST = 14;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set — nothing to back up.');
  process.exit(1);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const archivePath = path.join(BACKUP_DIR, `salon-backup-${timestamp}.sql.gz`);

try {
  const dump = execFileSync('pg_dump', [databaseUrl]);
  fs.writeFileSync(archivePath, zlib.gzipSync(dump));
  console.log(`Backup written to ${archivePath}`);
  pruneOldBackups();
} catch (err) {
  console.error('Backup failed:', err);
  process.exit(1);
}

function pruneOldBackups(): void {
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('salon-backup-') && f.endsWith('.sql.gz'))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  files.slice(KEEP_LAST).forEach((f) => {
    fs.unlinkSync(path.join(BACKUP_DIR, f.name));
    console.log(`Removed old backup: ${f.name}`);
  });
}
