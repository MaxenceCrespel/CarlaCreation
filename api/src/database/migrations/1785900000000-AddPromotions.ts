import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPromotions1785900000000 implements MigrationInterface {
  name = 'AddPromotions1785900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "promotions" (
        "id" SERIAL PRIMARY KEY,
        "label" TEXT NOT NULL,
        "discount_percent" INTEGER NOT NULL,
        "requires_code" BOOLEAN NOT NULL DEFAULT false,
        "code" TEXT,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_promotions_code" ON "promotions" ("code");`);

    await queryRunner.query(`ALTER TABLE "reservations" ADD COLUMN "promotion_id" INTEGER REFERENCES "promotions" ("id") ON DELETE SET NULL;`);
    await queryRunner.query(`ALTER TABLE "reservations" ADD COLUMN "discount_percent" INTEGER NOT NULL DEFAULT 0;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reservations" DROP COLUMN "discount_percent";`);
    await queryRunner.query(`ALTER TABLE "reservations" DROP COLUMN "promotion_id";`);
    await queryRunner.query(`DROP TABLE "promotions";`);
  }
}
