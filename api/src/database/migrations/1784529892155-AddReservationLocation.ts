import { MigrationInterface, QueryRunner } from 'typeorm';

// Carla is a solo auto-entrepreneuse, not a fixed salon: a client either
// comes to her, or she travels to the client's home for the appointment.
export class AddReservationLocation1784529892155 implements MigrationInterface {
  name = 'AddReservationLocation1784529892155';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reservations" ADD COLUMN "at_client_home" BOOLEAN NOT NULL DEFAULT false;`);
    await queryRunner.query(`ALTER TABLE "reservations" ADD COLUMN "client_address" TEXT;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reservations" DROP COLUMN "client_address";`);
    await queryRunner.query(`ALTER TABLE "reservations" DROP COLUMN "at_client_home";`);
  }
}
