import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClientFirstAndLastName1787100000000 implements MigrationInterface {
  name = 'AddClientFirstAndLastName1787100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Optional: older fiches only have the single `name`; the API derives
    // first/last from it (first word / rest) until the client edits their
    // profile. Compound names (Marie-Claire, de la Fontaine) are only
    // reliable when entered in two fields, hence these columns.
    await queryRunner.query(`ALTER TABLE "clients" ADD COLUMN "first_name" TEXT;`);
    await queryRunner.query(`ALTER TABLE "clients" ADD COLUMN "last_name" TEXT;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "last_name";`);
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "first_name";`);
  }
}
