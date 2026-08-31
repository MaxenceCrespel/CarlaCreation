import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCancellationReason1786000000000 implements MigrationInterface {
  name = 'AddCancellationReason1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reservations" ADD COLUMN "cancellation_reason" TEXT;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reservations" DROP COLUMN "cancellation_reason";`);
  }
}
