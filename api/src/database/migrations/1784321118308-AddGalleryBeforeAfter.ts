import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds an optional "before" photo alongside the existing `url` (used as the
// "after" photo when a pair is set) — nullable because existing/seeded
// entries stay single-photo, only new admin uploads set both.
export class AddGalleryBeforeAfter1784321118308 implements MigrationInterface {
  name = 'AddGalleryBeforeAfter1784321118308';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "gallery" ADD COLUMN "before_url" TEXT;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "gallery" DROP COLUMN "before_url";`);
  }
}
