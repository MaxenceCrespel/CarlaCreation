import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvoices1785500000000 implements MigrationInterface {
  name = 'AddInvoices1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "invoices" (
        "id" SERIAL PRIMARY KEY,
        "number" TEXT NOT NULL,
        "reservation_id" INTEGER REFERENCES "reservations" ("id") ON DELETE SET NULL,
        "client_name" TEXT NOT NULL,
        "client_email" TEXT NOT NULL DEFAULT '',
        "client_phone" TEXT NOT NULL DEFAULT '',
        "client_address" TEXT NOT NULL DEFAULT '',
        "issue_date" DATE NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'unpaid',
        "payment_method" TEXT,
        "paid_at" TIMESTAMPTZ,
        "total_cents" INTEGER NOT NULL DEFAULT 0,
        "notes" TEXT NOT NULL DEFAULT '',
        "legal_mentions" TEXT,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_invoices_number" ON "invoices" ("number");`);
    await queryRunner.query(`CREATE INDEX "IDX_invoices_reservation_id" ON "invoices" ("reservation_id");`);

    await queryRunner.query(`
      CREATE TABLE "invoice_items" (
        "id" SERIAL PRIMARY KEY,
        "invoice_id" INTEGER NOT NULL REFERENCES "invoices" ("id") ON DELETE CASCADE,
        "description" TEXT NOT NULL,
        "quantity" NUMERIC(10,2) NOT NULL DEFAULT 1,
        "unit_price_cents" INTEGER NOT NULL DEFAULT 0,
        "sort_order" INTEGER NOT NULL DEFAULT 0
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_invoice_items_invoice_id" ON "invoice_items" ("invoice_id");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "invoice_items";`);
    await queryRunner.query(`DROP TABLE "invoices";`);
  }
}
