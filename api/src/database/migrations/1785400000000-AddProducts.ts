import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProducts1785400000000 implements MigrationInterface {
  name = 'AddProducts1785400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" SERIAL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "unit" TEXT NOT NULL DEFAULT 'unité',
        "quantity" NUMERIC(10,2) NOT NULL DEFAULT 0,
        "low_stock_threshold" NUMERIC(10,2) NOT NULL DEFAULT 0,
        "notes" TEXT NOT NULL DEFAULT '',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "products";`);
  }
}
