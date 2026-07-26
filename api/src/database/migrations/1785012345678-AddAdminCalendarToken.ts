import { MigrationInterface, QueryRunner } from 'typeorm';

// Unguessable token embedded in the admin's public .ics calendar
// subscription URL — see CalendarFeedController.
export class AddAdminCalendarToken1785012345678 implements MigrationInterface {
  name = 'AddAdminCalendarToken1785012345678';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "admins" ADD COLUMN "calendar_token" TEXT;`);
    await queryRunner.query(`ALTER TABLE "admins" ADD CONSTRAINT "UQ_admins_calendar_token" UNIQUE ("calendar_token");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "admins" DROP CONSTRAINT "UQ_admins_calendar_token";`);
    await queryRunner.query(`ALTER TABLE "admins" DROP COLUMN "calendar_token";`);
  }
}
