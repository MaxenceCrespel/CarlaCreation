import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPointsLoyaltyAndReferral1786900000000 implements MigrationInterface {
  name = 'AddPointsLoyaltyAndReferral1786900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Points ledger: positive = earned, negative = redeemed. dedupe_key makes
    // every earning idempotent (INSERT ... ON CONFLICT DO NOTHING).
    await queryRunner.query(`
      CREATE TABLE "loyalty_points" (
        "id" SERIAL PRIMARY KEY,
        "client_id" INTEGER NOT NULL REFERENCES "clients" ("id") ON DELETE CASCADE,
        "points" INTEGER NOT NULL,
        "reason" TEXT NOT NULL,
        "dedupe_key" TEXT UNIQUE,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_loyalty_points_client_id" ON "loyalty_points" ("client_id");`);

    await queryRunner.query(`ALTER TABLE "clients" ADD COLUMN "referral_code" TEXT UNIQUE;`);
    await queryRunner.query(`ALTER TABLE "clients" ADD COLUMN "referred_by_client_id" INTEGER REFERENCES "clients" ("id") ON DELETE SET NULL;`);
    await queryRunner.query(`ALTER TABLE "clients" ADD COLUMN "referral_rewarded_at" TIMESTAMPTZ;`);
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "loyalty_reward_at_visits";`);

    // Euro-amount rewards and expiring codes.
    await queryRunner.query(`ALTER TABLE "promotions" ADD COLUMN "discount_cents" INTEGER;`);
    await queryRunner.query(`ALTER TABLE "promotions" ADD COLUMN "expires_at" TIMESTAMPTZ;`);
    await queryRunner.query(`ALTER TABLE "reservations" ADD COLUMN "discount_cents" INTEGER NOT NULL DEFAULT 0;`);

    // The visits-based loyalty system is replaced by points.
    await queryRunner.query(`ALTER TABLE "app_settings" DROP COLUMN "loyalty_visits_required";`);
    await queryRunner.query(`ALTER TABLE "app_settings" DROP COLUMN "loyalty_discount_percent";`);
    await queryRunner.query(`UPDATE "promotions" SET "active" = false WHERE "label" LIKE 'Fidélité — %';`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "app_settings" ADD COLUMN "loyalty_discount_percent" INTEGER NOT NULL DEFAULT 15;`);
    await queryRunner.query(`ALTER TABLE "app_settings" ADD COLUMN "loyalty_visits_required" INTEGER NOT NULL DEFAULT 5;`);
    await queryRunner.query(`ALTER TABLE "reservations" DROP COLUMN "discount_cents";`);
    await queryRunner.query(`ALTER TABLE "promotions" DROP COLUMN "expires_at";`);
    await queryRunner.query(`ALTER TABLE "promotions" DROP COLUMN "discount_cents";`);
    await queryRunner.query(`ALTER TABLE "clients" ADD COLUMN "loyalty_reward_at_visits" INTEGER;`);
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "referral_rewarded_at";`);
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "referred_by_client_id";`);
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "referral_code";`);
    await queryRunner.query(`DROP TABLE "loyalty_points";`);
  }
}
