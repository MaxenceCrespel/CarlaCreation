import { MigrationInterface, QueryRunner } from 'typeorm';

// Splits the old flat travel_fee_cents into a base call-out fee + a
// per-kilometre rate (the existing value becomes the new base fee, so
// nothing changes for anyone who hasn't reconfigured it yet — a 0 default
// per-km rate would silently zero out the surcharge for existing bookings'
// history, so it gets a sane non-zero default instead), and adds columns to
// persist the computed distance/duration/fee on each à-domicile
// reservation — previously never stored, only estimated client-side.
export class AddTravelDistance1785100000000 implements MigrationInterface {
  name = 'AddTravelDistance1785100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "app_settings" RENAME COLUMN "travel_fee_cents" TO "travel_fee_base_cents";`);
    await queryRunner.query(`ALTER TABLE "app_settings" ADD COLUMN "travel_fee_per_km_cents" INTEGER NOT NULL DEFAULT 50;`);
    await queryRunner.query(`ALTER TABLE "reservations" ADD COLUMN "travel_distance_km" NUMERIC(6,2);`);
    await queryRunner.query(`ALTER TABLE "reservations" ADD COLUMN "travel_duration_minutes" INTEGER;`);
    await queryRunner.query(`ALTER TABLE "reservations" ADD COLUMN "travel_fee_cents" INTEGER;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reservations" DROP COLUMN "travel_fee_cents";`);
    await queryRunner.query(`ALTER TABLE "reservations" DROP COLUMN "travel_duration_minutes";`);
    await queryRunner.query(`ALTER TABLE "reservations" DROP COLUMN "travel_distance_km";`);
    await queryRunner.query(`ALTER TABLE "app_settings" DROP COLUMN "travel_fee_per_km_cents";`);
    await queryRunner.query(`ALTER TABLE "app_settings" RENAME COLUMN "travel_fee_base_cents" TO "travel_fee_cents";`);
  }
}
