import { MigrationInterface, QueryRunner } from 'typeorm';

// One level of subcategories under a category (e.g. "Hommes" under
// "Coiffure") — enforced app-side (ServiceCategoriesService), the FK here
// only guarantees parent_id points at a real category.
export class AddServiceCategoryParent1784978234901 implements MigrationInterface {
  name = 'AddServiceCategoryParent1784978234901';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "service_categories" ADD COLUMN "parent_id" INTEGER REFERENCES "service_categories" ("id");`);
    await queryRunner.query(`CREATE INDEX "IDX_service_categories_parent_id" ON "service_categories" ("parent_id");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_service_categories_parent_id";`);
    await queryRunner.query(`ALTER TABLE "service_categories" DROP COLUMN "parent_id";`);
  }
}
