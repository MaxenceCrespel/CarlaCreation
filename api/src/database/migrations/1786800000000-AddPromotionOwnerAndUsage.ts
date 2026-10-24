import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPromotionOwnerAndUsage1786800000000 implements MigrationInterface {
  name = 'AddPromotionOwnerAndUsage1786800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "promotions" ADD COLUMN "client_id" INTEGER;`);
    await queryRunner.query(`ALTER TABLE "promotions" ADD COLUMN "used_at" TIMESTAMPTZ;`);
    // Reward codes issued before this migration were reusable and ownerless;
    // retire them rather than leave open codes around.
    await queryRunner.query(`UPDATE "promotions" SET "active" = false WHERE "label" LIKE 'Fidélité — %' OR "label" LIKE 'Anniversaire — %';`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "promotions" DROP COLUMN "used_at";`);
    await queryRunner.query(`ALTER TABLE "promotions" DROP COLUMN "client_id";`);
  }
}
