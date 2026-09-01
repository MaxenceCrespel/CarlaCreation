import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReviewAdminReply1786200000000 implements MigrationInterface {
  name = 'AddReviewAdminReply1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reviews" ADD COLUMN "admin_reply" TEXT;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reviews" DROP COLUMN "admin_reply";`);
  }
}
