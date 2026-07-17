const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'data', 'salon.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'coiffure',
    duration_minutes INTEGER NOT NULL,
    price_cents INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id INTEGER NOT NULL REFERENCES services(id),
    client_name TEXT NOT NULL,
    client_email TEXT NOT NULL,
    client_phone TEXT NOT NULL,
    reservation_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(reservation_date);

  CREATE TABLE IF NOT EXISTS gallery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    alt_text TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_upload INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contact_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Weekly opening hours: one row per weekday (0 = Sunday ... 6 = Saturday).
  CREATE TABLE IF NOT EXISTS opening_hours (
    day_of_week INTEGER PRIMARY KEY CHECK (day_of_week BETWEEN 0 AND 6),
    is_closed INTEGER NOT NULL DEFAULT 0,
    open_time TEXT,
    close_time TEXT
  );

  -- Specific closed dates (holidays, vacation) that override weekly hours.
  CREATE TABLE IF NOT EXISTS blackout_dates (
    date TEXT PRIMARY KEY,
    reason TEXT NOT NULL DEFAULT ''
  );
`);

// Defensive migration: older databases created before the `url` column existed.
const galleryColumns = db.prepare('PRAGMA table_info(gallery)').all().map((c) => c.name);
if (!galleryColumns.includes('url') && galleryColumns.includes('filename')) {
  db.exec('ALTER TABLE gallery ADD COLUMN url TEXT');
  db.prepare("UPDATE gallery SET url = 'images/' || filename WHERE url IS NULL").run();
}
if (!galleryColumns.includes('is_upload')) {
  db.exec('ALTER TABLE gallery ADD COLUMN is_upload INTEGER NOT NULL DEFAULT 0');
}
const serviceColumns = db.prepare('PRAGMA table_info(services)').all().map((c) => c.name);
if (!serviceColumns.includes('category')) {
  db.exec("ALTER TABLE services ADD COLUMN category TEXT NOT NULL DEFAULT 'coiffure'");
}

// Seed default services once
const serviceCount = db.prepare('SELECT COUNT(*) AS c FROM services').get().c;
if (serviceCount === 0) {
  const insert = db.prepare(
    `INSERT INTO services (name, description, category, duration_minutes, price_cents, active)
     VALUES (@name, @description, @category, @duration_minutes, @price_cents, 1)`
  );
  const defaults = [
    { name: 'Coupe Femme', description: 'Coupe, brushing et coiffage personnalisés.', category: 'coiffure', duration_minutes: 45, price_cents: 4500 },
    { name: 'Coupe Homme', description: 'Coupe précise avec finitions à la tondeuse.', category: 'coiffure', duration_minutes: 30, price_cents: 2500 },
    { name: 'Coloration', description: 'Coloration complète avec soin protecteur.', category: 'coiffure', duration_minutes: 90, price_cents: 7500 },
    { name: 'Balayage', description: 'Balayage main levée pour un effet naturel.', category: 'coiffure', duration_minutes: 120, price_cents: 9500 },
    { name: 'Brushing', description: 'Mise en forme et brillance longue durée.', category: 'coiffure', duration_minutes: 30, price_cents: 3000 },
    { name: 'Soin Capillaire', description: 'Soin profond réparateur et hydratant.', category: 'coiffure', duration_minutes: 30, price_cents: 3500 },
    { name: 'Manucure Classique', description: 'Soin des mains, limage et pose de vernis classique.', category: 'ongles', duration_minutes: 30, price_cents: 2500 },
    { name: 'Pose Semi-Permanent', description: 'Pose vernis semi-permanent longue tenue, large choix de teintes.', category: 'ongles', duration_minutes: 45, price_cents: 3500 },
    { name: 'Nail Art', description: 'Décorations et motifs personnalisés sur mesure.', category: 'ongles', duration_minutes: 60, price_cents: 4500 },
    { name: 'Beauté des Pieds', description: 'Soin complet des pieds avec pose de vernis.', category: 'ongles', duration_minutes: 45, price_cents: 4000 },
  ];
  const insertMany = db.transaction((rows) => rows.forEach((r) => insert.run(r)));
  insertMany(defaults);
}

// Seed a few gallery placeholders once
const galleryCount = db.prepare('SELECT COUNT(*) AS c FROM gallery').get().c;
if (galleryCount === 0) {
  const insert = db.prepare(
    `INSERT INTO gallery (url, alt_text, sort_order, is_upload) VALUES (@url, @alt_text, @sort_order, 0)`
  );
  const defaults = [
    { url: 'images/placeholder-1.svg', alt_text: 'Réalisation coiffure 1', sort_order: 1 },
    { url: 'images/placeholder-2.svg', alt_text: 'Réalisation coiffure 2', sort_order: 2 },
    { url: 'images/placeholder-3.svg', alt_text: 'Réalisation coiffure 3', sort_order: 3 },
    { url: 'images/placeholder-4.svg', alt_text: 'Réalisation coiffure 4', sort_order: 4 },
    { url: 'images/placeholder-5.svg', alt_text: 'Réalisation coiffure 5', sort_order: 5 },
    { url: 'images/placeholder-6.svg', alt_text: 'Réalisation coiffure 6', sort_order: 6 },
  ];
  const insertMany = db.transaction((rows) => rows.forEach((r) => insert.run(r)));
  insertMany(defaults);
}

// Seed default weekly opening hours once (matches the salon's usual schedule).
const hoursCount = db.prepare('SELECT COUNT(*) AS c FROM opening_hours').get().c;
if (hoursCount === 0) {
  const insert = db.prepare(
    `INSERT INTO opening_hours (day_of_week, is_closed, open_time, close_time)
     VALUES (@day_of_week, @is_closed, @open_time, @close_time)`
  );
  const defaults = [
    { day_of_week: 0, is_closed: 1, open_time: null, close_time: null }, // Dimanche
    { day_of_week: 1, is_closed: 1, open_time: null, close_time: null }, // Lundi
    { day_of_week: 2, is_closed: 0, open_time: '09:00', close_time: '19:00' }, // Mardi
    { day_of_week: 3, is_closed: 0, open_time: '09:00', close_time: '19:00' }, // Mercredi
    { day_of_week: 4, is_closed: 0, open_time: '09:00', close_time: '19:00' }, // Jeudi
    { day_of_week: 5, is_closed: 0, open_time: '09:00', close_time: '19:00' }, // Vendredi
    { day_of_week: 6, is_closed: 0, open_time: '09:00', close_time: '17:00' }, // Samedi
  ];
  const insertMany = db.transaction((rows) => rows.forEach((r) => insert.run(r)));
  insertMany(defaults);
}

module.exports = db;
