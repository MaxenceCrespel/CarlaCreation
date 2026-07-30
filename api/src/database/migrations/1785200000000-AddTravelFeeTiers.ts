import { MigrationInterface, QueryRunner } from 'typeorm';

// Replaces the flat "base + per-km" travel fee with a step-function fee
// schedule (e.g. free under 10km, +2€ beyond) — travel_fee_base_cents
// becomes the fallback used only when a client's distance can't be
// determined at all (geocoding disabled/unresolvable), and
// travel_fee_per_km_cents is dropped entirely since fees are now tier-based
// rather than computed per kilometre.
export class AddTravelFeeTiers1785200000000 implements MigrationInterface {
  name = 'AddTravelFeeTiers1785200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "app_settings" RENAME COLUMN "travel_fee_base_cents" TO "travel_fee_fallback_cents";`);
    await queryRunner.query(`ALTER TABLE "app_settings" DROP COLUMN "travel_fee_per_km_cents";`);

    await queryRunner.query(`
      CREATE TABLE "travel_fee_tiers" (
        "id" SERIAL PRIMARY KEY,
        "min_km" NUMERIC(6,2) NOT NULL,
        "fee_cents" INTEGER NOT NULL DEFAULT 0
      );
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_travel_fee_tiers_min_km" ON "travel_fee_tiers" ("min_km");`);
    // Default schedule: free within 10km, then a flat 2€ surcharge beyond —
    // matches the previous default (200 cents) as the first paid tier, so
    // nothing changes for a deployment that hasn't reconfigured this yet
    // other than clients within 10km no longer being charged at all.
    await queryRunner.query(`INSERT INTO "travel_fee_tiers" (min_km, fee_cents) VALUES (0, 0), (10, 200);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "travel_fee_tiers";`);
    await queryRunner.query(`ALTER TABLE "app_settings" ADD COLUMN "travel_fee_per_km_cents" INTEGER NOT NULL DEFAULT 50;`);
    await queryRunner.query(`ALTER TABLE "app_settings" RENAME COLUMN "travel_fee_fallback_cents" TO "travel_fee_base_cents";`);
  }
}
