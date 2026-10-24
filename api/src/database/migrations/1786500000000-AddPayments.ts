import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayments1786500000000 implements MigrationInterface {
  name = 'AddPayments1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" SERIAL PRIMARY KEY,
        "group_id" TEXT NOT NULL,
        "amount_cents" INTEGER NOT NULL,
        "stripe_checkout_session_id" TEXT,
        "stripe_payment_intent_id" TEXT,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "refunded_amount_cents" INTEGER,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "paid_at" TIMESTAMPTZ,
        "refunded_at" TIMESTAMPTZ
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_payments_group_id" ON "payments" ("group_id");`);

    // Governs refund eligibility for an online payment cancelled by the
    // client — see ReservationsService.cancelByGroupId. No deposit-percent
    // setting: online payment is always the full amount now (see
    // AddAuthorizedAtAndOnSitePayment for the "pay in person instead"
    // alternative).
    await queryRunner.query(`ALTER TABLE "app_settings" ADD COLUMN "refund_deadline_hours" INTEGER NOT NULL DEFAULT 48;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "app_settings" DROP COLUMN "refund_deadline_hours";`);
    await queryRunner.query(`DROP TABLE "payments";`);
  }
}
