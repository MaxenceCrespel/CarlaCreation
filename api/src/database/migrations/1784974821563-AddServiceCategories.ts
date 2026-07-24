import { MigrationInterface, QueryRunner } from 'typeorm';

// Replaces the hardcoded coiffure/ongles enum on services with an
// admin-manageable service_categories table (e.g. so a "Homme" category can
// be added later without a code change).
export class AddServiceCategories1784974821563 implements MigrationInterface {
  name = 'AddServiceCategories1784974821563';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "service_categories" (
        "id" SERIAL PRIMARY KEY,
        "name" TEXT NOT NULL UNIQUE,
        "sort_order" INTEGER NOT NULL DEFAULT 0
      );
    `);
    await queryRunner.query(`
      INSERT INTO "service_categories" ("id", "name", "sort_order") VALUES (1, 'Coiffure', 0), (2, 'Ongles', 1);
    `);
    await queryRunner.query(`SELECT setval('service_categories_id_seq', 2);`);

    await queryRunner.query(`ALTER TABLE "services" ADD COLUMN "category_id" INTEGER;`);
    await queryRunner.query(`UPDATE "services" SET "category_id" = CASE WHEN "category" = 'ongles' THEN 2 ELSE 1 END;`);
    await queryRunner.query(`ALTER TABLE "services" ALTER COLUMN "category_id" SET NOT NULL;`);
    await queryRunner.query(`
      ALTER TABLE "services"
      ADD CONSTRAINT "FK_services_category" FOREIGN KEY ("category_id") REFERENCES "service_categories" ("id");
    `);
    await queryRunner.query(`CREATE INDEX "IDX_services_category_id" ON "services" ("category_id");`);
    await queryRunner.query(`ALTER TABLE "services" DROP COLUMN "category";`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "services" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'coiffure';`);
    await queryRunner.query(`
      UPDATE "services" SET "category" = (
        SELECT CASE WHEN "name" = 'Ongles' THEN 'ongles' ELSE 'coiffure' END
        FROM "service_categories" WHERE "id" = "services"."category_id"
      );
    `);
    await queryRunner.query(`DROP INDEX "IDX_services_category_id";`);
    await queryRunner.query(`ALTER TABLE "services" DROP CONSTRAINT "FK_services_category";`);
    await queryRunner.query(`ALTER TABLE "services" DROP COLUMN "category_id";`);
    await queryRunner.query(`DROP TABLE "service_categories";`);
  }
}
