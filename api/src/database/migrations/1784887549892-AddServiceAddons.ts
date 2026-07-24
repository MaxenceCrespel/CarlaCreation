import { MigrationInterface, QueryRunner } from 'typeorm';

// Optional extras a client can add to a specific prestation (e.g. "Nail
// art" on "Manucure Classique") — adds to both price and duration.
export class AddServiceAddons1784887549892 implements MigrationInterface {
  name = 'AddServiceAddons1784887549892';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "service_addons" (
        "id" SERIAL PRIMARY KEY,
        "service_id" INTEGER NOT NULL REFERENCES "services"("id") ON DELETE CASCADE,
        "name" TEXT NOT NULL,
        "extra_price_cents" INTEGER NOT NULL DEFAULT 0,
        "extra_duration_minutes" INTEGER NOT NULL DEFAULT 0,
        "active" BOOLEAN NOT NULL DEFAULT true
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_service_addons_service_id" ON "service_addons" ("service_id");`);

    await queryRunner.query(`
      CREATE TABLE "reservation_addons" (
        "id" SERIAL PRIMARY KEY,
        "reservation_id" INTEGER NOT NULL REFERENCES "reservations"("id") ON DELETE CASCADE,
        "name" TEXT NOT NULL,
        "extra_price_cents" INTEGER NOT NULL DEFAULT 0,
        "extra_duration_minutes" INTEGER NOT NULL DEFAULT 0
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_reservation_addons_reservation_id" ON "reservation_addons" ("reservation_id");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "reservation_addons";`);
    await queryRunner.query(`DROP TABLE "service_addons";`);
  }
}
