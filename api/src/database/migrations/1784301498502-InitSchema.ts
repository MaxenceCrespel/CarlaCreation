import { MigrationInterface, QueryRunner } from 'typeorm';

// Initial schema, ported from the previous SQLite implementation
// (api/src/database/schema.ts, kept only for historical reference — no
// longer executed). No defensive "legacy database" migrations here: this
// project has no production data yet, so this is a clean, fresh schema.
export class InitSchema1784301498502 implements MigrationInterface {
  name = 'InitSchema1784301498502';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "admins" (
        "id" SERIAL PRIMARY KEY,
        "username" TEXT UNIQUE NOT NULL,
        "password_hash" TEXT NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "services" (
        "id" SERIAL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "description" TEXT NOT NULL DEFAULT '',
        "category" TEXT NOT NULL DEFAULT 'coiffure',
        "duration_minutes" INTEGER NOT NULL,
        "price_cents" INTEGER NOT NULL,
        "active" BOOLEAN NOT NULL DEFAULT true
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "reservations" (
        "id" SERIAL PRIMARY KEY,
        "group_id" TEXT,
        "service_id" INTEGER NOT NULL REFERENCES "services"("id"),
        "client_name" TEXT NOT NULL,
        "client_email" TEXT NOT NULL,
        "client_phone" TEXT NOT NULL,
        "reservation_date" TEXT NOT NULL,
        "start_time" TEXT NOT NULL,
        "end_time" TEXT NOT NULL,
        "notes" TEXT NOT NULL DEFAULT '',
        "status" TEXT NOT NULL DEFAULT 'pending',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_reservations_reservation_date" ON "reservations" ("reservation_date");`);
    await queryRunner.query(`CREATE INDEX "IDX_reservations_group_id" ON "reservations" ("group_id");`);

    await queryRunner.query(`
      CREATE TABLE "gallery" (
        "id" SERIAL PRIMARY KEY,
        "url" TEXT NOT NULL,
        "alt_text" TEXT NOT NULL DEFAULT '',
        "sort_order" INTEGER NOT NULL DEFAULT 0,
        "is_upload" BOOLEAN NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "contact_messages" (
        "id" SERIAL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "message" TEXT NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "reviews" (
        "id" SERIAL PRIMARY KEY,
        "client_name" TEXT NOT NULL,
        "rating" INTEGER NOT NULL,
        "comment" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_reviews_status" ON "reviews" ("status");`);

    await queryRunner.query(`
      CREATE TABLE "daily_hours" (
        "date" TEXT PRIMARY KEY,
        "is_closed" BOOLEAN NOT NULL DEFAULT false
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "daily_hours_ranges" (
        "id" SERIAL PRIMARY KEY,
        "date" TEXT NOT NULL REFERENCES "daily_hours"("date") ON DELETE CASCADE,
        "open_time" TEXT NOT NULL,
        "close_time" TEXT NOT NULL
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_daily_hours_ranges_date" ON "daily_hours_ranges" ("date");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "daily_hours_ranges";`);
    await queryRunner.query(`DROP TABLE "daily_hours";`);
    await queryRunner.query(`DROP TABLE "reviews";`);
    await queryRunner.query(`DROP TABLE "contact_messages";`);
    await queryRunner.query(`DROP TABLE "gallery";`);
    await queryRunner.query(`DROP TABLE "reservations";`);
    await queryRunner.query(`DROP TABLE "services";`);
    await queryRunner.query(`DROP TABLE "admins";`);
  }
}
