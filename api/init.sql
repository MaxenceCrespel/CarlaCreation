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

DROP TABLE IF EXISTS app_settings;
DROP TABLE IF EXISTS daily_hours_ranges;
DROP TABLE IF EXISTS daily_hours;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS contact_messages;
DROP TABLE IF EXISTS gallery;
DROP TABLE IF EXISTS reservation_addons;
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS service_addons;
DROP TABLE IF EXISTS services;
DROP TABLE IF EXISTS service_categories;
DROP TABLE IF EXISTS admins;

CREATE TABLE
    IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

CREATE TABLE
    IF NOT EXISTS service_categories (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        parent_id INTEGER REFERENCES service_categories (id)
    );

CREATE INDEX IF NOT EXISTS "IDX_service_categories_parent_id" ON service_categories (parent_id);

INSERT INTO service_categories (id, name, sort_order) VALUES (1, 'Coiffure', 0), (2, 'Ongles', 1);

SELECT setval('service_categories_id_seq', 2);

CREATE TABLE
    IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        category_id INTEGER NOT NULL REFERENCES service_categories (id),
        duration_minutes INTEGER NOT NULL,
        price_cents INTEGER NOT NULL,
        active BOOLEAN NOT NULL DEFAULT true
    );

CREATE INDEX IF NOT EXISTS "IDX_services_category_id" ON services (category_id);

CREATE TABLE
    IF NOT EXISTS service_addons (
        id SERIAL PRIMARY KEY,
        service_id INTEGER NOT NULL REFERENCES services (id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        extra_price_cents INTEGER NOT NULL DEFAULT 0,
        extra_duration_minutes INTEGER NOT NULL DEFAULT 0,
        active BOOLEAN NOT NULL DEFAULT true
    );

CREATE INDEX IF NOT EXISTS "IDX_service_addons_service_id" ON service_addons (service_id);

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
        at_client_home BOOLEAN NOT NULL DEFAULT false,
        client_address TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

CREATE INDEX IF NOT EXISTS "IDX_reservations_reservation_date" ON reservations (reservation_date);

CREATE INDEX IF NOT EXISTS "IDX_reservations_group_id" ON reservations (group_id);

CREATE TABLE
    IF NOT EXISTS reservation_addons (
        id SERIAL PRIMARY KEY,
        reservation_id INTEGER NOT NULL REFERENCES reservations (id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        extra_price_cents INTEGER NOT NULL DEFAULT 0,
        extra_duration_minutes INTEGER NOT NULL DEFAULT 0
    );

CREATE INDEX IF NOT EXISTS "IDX_reservation_addons_reservation_id" ON reservation_addons (reservation_id);

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

CREATE TABLE
    IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        travel_buffer_minutes INTEGER NOT NULL DEFAULT 30,
        travel_fee_cents INTEGER NOT NULL DEFAULT 200
    );

INSERT INTO app_settings (id, travel_buffer_minutes, travel_fee_cents) VALUES (1, 30, 200);

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
    (1784394804417, 'AddReservationReminderSent1784394804417'),
    (1784529892155, 'AddReservationLocation1784529892155'),
    (1784531313161, 'AddAppSettings1784531313161'),
    (1784887549892, 'AddServiceAddons1784887549892'),
    (1784973912847, 'AddTravelFee1784973912847'),
    (1784974821563, 'AddServiceCategories1784974821563'),
    (1784978234901, 'AddServiceCategoryParent1784978234901');

-- Admin account — username "carla", password "Carla0303!" (bcrypt, cost 12).
-- Change this password after first login in a real deployment.
INSERT INTO
    admins (username, password_hash)
VALUES
    (
        'carla',
        '$2a$12$F8rHURhmtmTIHnQbf3cOBOu9dM1c9qaa8f4gsyyrJfW.S7XHKVnQK'
    );

-- No demo services/gallery/reviews seeded — this is a real business, not a
-- local dev demo. Carla adds her own prestations, photos, and moderates
-- reviews from the admin panel after first login.
