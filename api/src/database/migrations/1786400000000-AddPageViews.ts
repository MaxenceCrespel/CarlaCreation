import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPageViews1786400000000 implements MigrationInterface {
  name = 'AddPageViews1786400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "page_views" (
        "id" SERIAL PRIMARY KEY,
        "path" TEXT NOT NULL,
        "visitor_id" TEXT NOT NULL,
        "source" TEXT NOT NULL,
        "device" TEXT NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_page_views_created_at" ON "page_views" ("created_at");`);
    await queryRunner.query(`CREATE INDEX "IDX_page_views_visitor_id_created_at" ON "page_views" ("visitor_id", "created_at");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "page_views";`);
  }
}
