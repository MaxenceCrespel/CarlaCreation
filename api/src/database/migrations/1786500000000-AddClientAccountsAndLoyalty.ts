import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClientAccountsAndLoyalty1786500000000 implements MigrationInterface {
  name = 'AddClientAccountsAndLoyalty1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clients" ADD COLUMN "password_hash" TEXT;`);
    await queryRunner.query(`ALTER TABLE "clients" ADD COLUMN "birthdate" TEXT;`);
    await queryRunner.query(`ALTER TABLE "clients" ADD COLUMN "loyalty_reward_at_visits" INTEGER;`);
    await queryRunner.query(`ALTER TABLE "clients" ADD COLUMN "birthday_reward_year" INTEGER;`);

    await queryRunner.query(`ALTER TABLE "app_settings" ADD COLUMN "loyalty_visits_required" INTEGER NOT NULL DEFAULT 5;`);
    await queryRunner.query(`ALTER TABLE "app_settings" ADD COLUMN "loyalty_discount_percent" INTEGER NOT NULL DEFAULT 15;`);
    await queryRunner.query(`ALTER TABLE "app_settings" ADD COLUMN "birthday_discount_percent" INTEGER NOT NULL DEFAULT 10;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "app_settings" DROP COLUMN "birthday_discount_percent";`);
    await queryRunner.query(`ALTER TABLE "app_settings" DROP COLUMN "loyalty_discount_percent";`);
    await queryRunner.query(`ALTER TABLE "app_settings" DROP COLUMN "loyalty_visits_required";`);

    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "birthday_reward_year";`);
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "loyalty_reward_at_visits";`);
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "birthdate";`);
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "password_hash";`);
  }
}
