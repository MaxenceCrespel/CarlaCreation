import { MigrationInterface, QueryRunner } from 'typeorm';

// Reuses the same service_categories taxonomy as prestations (Coiffure,
// Ongles, Homme...) instead of a separate gallery-only category list —
// nullable so existing/new photos aren't forced into a category up front.
export class AddGalleryCategory1785018765432 implements MigrationInterface {
  name = 'AddGalleryCategory1785018765432';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "gallery" ADD COLUMN "category_id" INTEGER REFERENCES "service_categories" ("id");`);
    await queryRunner.query(`CREATE INDEX "IDX_gallery_category_id" ON "gallery" ("category_id");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_gallery_category_id";`);
    await queryRunner.query(`ALTER TABLE "gallery" DROP COLUMN "category_id";`);
  }
}
