import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuthorizedAtAndOnSitePayment1786600000000 implements MigrationInterface {
  name = 'AddAuthorizedAtAndOnSitePayment1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Set when the checkout completed and the hold was placed (status
    // 'authorized'). Stripe auto-releases an uncaptured authorization after
    // 7 days — a stale authorized_at is the signal that capture will fail.
    await queryRunner.query(`ALTER TABLE "payments" ADD COLUMN "authorized_at" TIMESTAMPTZ;`);

    // The other half of the booking-time choice: instead of paying online,
    // the client can pick "payer sur place" — Carla collects payment in
    // person later (cash, or the SumUp app's own Tap to Pay on her phone,
    // entirely outside this system). There's no Stripe involvement at all
    // for that path, so no `payments` row — just this flag, toggled by
    // Carla herself once she's actually been paid, purely for her own
    // bookkeeping visibility in the admin list.
    await queryRunner.query(`ALTER TABLE "reservations" ADD COLUMN "paid_on_site" BOOLEAN NOT NULL DEFAULT false;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reservations" DROP COLUMN "paid_on_site";`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "authorized_at";`);
  }
}
