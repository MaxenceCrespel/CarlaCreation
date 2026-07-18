import { MigrationInterface, QueryRunner } from 'typeorm';

// Tracks whether the 24h-before reminder email has already gone out for a
// reservation, so the periodic reminder job (ReservationsService) never
// sends it twice.
export class AddReservationReminderSent1784394804417 implements MigrationInterface {
  name = 'AddReservationReminderSent1784394804417';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reservations" ADD COLUMN "reminder_sent" BOOLEAN NOT NULL DEFAULT false;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reservations" DROP COLUMN "reminder_sent";`);
  }
}
