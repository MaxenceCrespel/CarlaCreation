import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductPurchasePrice1785600000000 implements MigrationInterface {
  name = 'AddProductPurchasePrice1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" ADD COLUMN "purchase_price_cents" INTEGER NOT NULL DEFAULT 0;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "purchase_price_cents";`);
  }
}
