-- Bootstrap schema + seed data for a fresh database. Executed automatically
-- by the official Postgres image on first container start (mounted into
-- /docker-entrypoint-initdb.d/ in docker-compose.yml) — only ever runs
-- once, against an empty data volume, so DROP TABLE IF EXISTS here is just
-- defensive, not a "wipes your data on every restart" risk.
--
-- This mirrors api/src/database/migrations/*-InitSchema.ts exactly (same
-- columns/types/indexes) — that TypeORM migration remains the source of
-- truth for schema *changes* over time; this file is only the fast,
-- one-command bootstrap path for a brand new database (Docker, or a local
-- Postgres you're setting up by hand).

DROP TABLE IF EXISTS daily_hours_ranges;
DROP TABLE IF EXISTS daily_hours;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS contact_messages;
DROP TABLE IF EXISTS gallery;
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS services;
DROP TABLE IF EXISTS admins;

CREATE TABLE
    IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

CREATE TABLE
    IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'coiffure',
        duration_minutes INTEGER NOT NULL,
        price_cents INTEGER NOT NULL,
        active BOOLEAN NOT NULL DEFAULT true
    );

CREATE TABLE
    IF NOT EXISTS reservations (
        id SERIAL PRIMARY KEY,
        group_id TEXT,
        service_id INTEGER NOT NULL REFERENCES services (id),
        client_name TEXT NOT NULL,
        client_email TEXT NOT NULL,
        client_phone TEXT NOT NULL,
        reservation_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        reminder_sent BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

CREATE INDEX IF NOT EXISTS "IDX_reservations_reservation_date" ON reservations (reservation_date);

CREATE INDEX IF NOT EXISTS "IDX_reservations_group_id" ON reservations (group_id);

CREATE TABLE
    IF NOT EXISTS gallery (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        before_url TEXT,
        alt_text TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_upload BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

CREATE TABLE
    IF NOT EXISTS contact_messages (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

CREATE TABLE
    IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        client_name TEXT NOT NULL,
        rating INTEGER NOT NULL,
        comment TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

CREATE INDEX IF NOT EXISTS "IDX_reviews_status" ON reviews (status);

CREATE TABLE
    IF NOT EXISTS daily_hours (
        date TEXT PRIMARY KEY,
        is_closed BOOLEAN NOT NULL DEFAULT false
    );

CREATE TABLE
    IF NOT EXISTS daily_hours_ranges (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL REFERENCES daily_hours (date) ON DELETE CASCADE,
        open_time TEXT NOT NULL,
        close_time TEXT NOT NULL
    );

CREATE INDEX IF NOT EXISTS "IDX_daily_hours_ranges_date" ON daily_hours_ranges (date);

-- Records this bootstrap as already-applied so `npm run migration:run`
-- doesn't try to re-run the (already-executed-via-this-file) InitSchema
-- migration against this database later.
CREATE TABLE
    IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        timestamp BIGINT NOT NULL,
        name VARCHAR NOT NULL
    );

INSERT INTO
    migrations (timestamp, name)
VALUES
    (1784301498502, 'InitSchema1784301498502'),
    (1784321118308, 'AddGalleryBeforeAfter1784321118308'),
    (1784394804417, 'AddReservationReminderSent1784394804417');

-- Admin account — username "carla", password "Carla0303!" (bcrypt, cost 12).
-- Change this password after first login in a real deployment.
INSERT INTO
    admins (username, password_hash)
VALUES
    (
        'carla',
        '$2a$12$F8rHURhmtmTIHnQbf3cOBOu9dM1c9qaa8f4gsyyrJfW.S7XHKVnQK'
    );

INSERT INTO
    services (
        name,
        description,
        category,
        duration_minutes,
        price_cents
    )
VALUES
    (
        'Coupe Femme',
        'Coupe, brushing et coiffage personnalisés.',
        'coiffure',
        45,
        4500
    ),
    (
        'Coupe Homme',
        'Coupe précise avec finitions à la tondeuse.',
        'coiffure',
        30,
        2500
    ),
    (
        'Coloration',
        'Coloration complète avec soin protecteur.',
        'coiffure',
        90,
        7500
    ),
    (
        'Balayage',
        'Balayage main levée pour un effet naturel.',
        'coiffure',
        120,
        9500
    ),
    (
        'Brushing',
        'Mise en forme et brillance longue durée.',
        'coiffure',
        30,
        3000
    ),
    (
        'Soin Capillaire',
        'Soin profond réparateur et hydratant.',
        'coiffure',
        30,
        3500
    ),
    (
        'Manucure Classique',
        'Soin des mains, limage et pose de vernis classique.',
        'ongles',
        30,
        2500
    ),
    (
        'Pose Semi-Permanent',
        'Pose vernis semi-permanent longue tenue, large choix de teintes.',
        'ongles',
        45,
        3500
    ),
    (
        'Nail Art',
        'Décorations et motifs personnalisés sur mesure.',
        'ongles',
        60,
        4500
    ),
    (
        'Beauté des Pieds',
        'Soin complet des pieds avec pose de vernis.',
        'ongles',
        45,
        4000
    );

INSERT INTO
    gallery (url, alt_text, sort_order)
VALUES
    (
        'images/placeholder-1.svg',
        'Réalisation coiffure 1',
        1
    ),
    (
        'images/placeholder-2.svg',
        'Réalisation coiffure 2',
        2
    ),
    (
        'images/placeholder-3.svg',
        'Réalisation coiffure 3',
        3
    ),
    (
        'images/placeholder-4.svg',
        'Réalisation coiffure 4',
        4
    ),
    (
        'images/placeholder-5.svg',
        'Réalisation coiffure 5',
        5
    ),
    (
        'images/placeholder-6.svg',
        'Réalisation coiffure 6',
        6
    );

INSERT INTO
    reviews (client_name, rating, comment, status)
VALUES
    (
        'Camille D.',
        5,
        'Un accueil chaleureux et un résultat toujours au rendez-vous. Je recommande les yeux fermés !',
        'approved'
    ),
    (
        'Julien M.',
        5,
        'La réservation en ligne est super pratique, plus besoin d''appeler. Coupe impeccable comme toujours.',
        'approved'
    ),
    (
        'Sarah B.',
        5,
        'Mon nail art est toujours magnifique et tient plusieurs semaines. Une vraie artiste !',
        'approved'
    );
