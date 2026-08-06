import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExpenses1785700000000 implements MigrationInterface {
  name = 'AddExpenses1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "expenses" (
        "id" SERIAL PRIMARY KEY,
        "expense_date" DATE NOT NULL,
        "category" TEXT NOT NULL DEFAULT 'Autre',
        "description" TEXT NOT NULL DEFAULT '',
        "amount_cents" INTEGER NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_expenses_expense_date" ON "expenses" ("expense_date");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "expenses";`);
  }
}
