import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContactMessageIsRead1786100000000 implements MigrationInterface {
  name = 'AddContactMessageIsRead1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contact_messages" ADD COLUMN "is_read" BOOLEAN NOT NULL DEFAULT false;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contact_messages" DROP COLUMN "is_read";`);
  }
}
