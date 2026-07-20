import { MigrationInterface, QueryRunner } from 'typeorm';

// Single-row settings table — starts with the à-domicile travel buffer
// (admin-editable, replaces the old hardcoded site-config constant).
export class AddAppSettings1784531313161 implements MigrationInterface {
  name = 'AddAppSettings1784531313161';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "app_settings" (
        "id" INTEGER PRIMARY KEY DEFAULT 1,
        "travel_buffer_minutes" INTEGER NOT NULL DEFAULT 30
      );
    `);
    await queryRunner.query(`INSERT INTO "app_settings" ("id", "travel_buffer_minutes") VALUES (1, 30);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "app_settings";`);
  }
}
