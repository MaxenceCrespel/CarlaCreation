import { MigrationInterface, QueryRunner } from 'typeorm';

// Flat surcharge (default 2€) automatically applied to à-domicile
// bookings, alongside the existing travel_buffer_minutes setting.
export class AddTravelFee1784973912847 implements MigrationInterface {
  name = 'AddTravelFee1784973912847';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "app_settings" ADD COLUMN "travel_fee_cents" INTEGER NOT NULL DEFAULT 200;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "app_settings" DROP COLUMN "travel_fee_cents";`);
  }
}
