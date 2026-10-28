import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReservationRewardCode1787300000000 implements MigrationInterface {
  name = 'AddReservationRewardCode1787300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The personal single-use code (birthday, loyalty reward) a booking spent.
    // promotion_id can't carry it when the guest also has their own tarif
    // spécial (it keeps the tarif), so a cancelled booking wouldn't know
    // which code to give back.
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD COLUMN "reward_code_id" INTEGER REFERENCES "promotions" ("id") ON DELETE SET NULL;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reservations" DROP COLUMN "reward_code_id";`);
  }
}
