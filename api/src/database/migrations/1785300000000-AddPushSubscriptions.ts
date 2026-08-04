import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPushSubscriptions1785300000000 implements MigrationInterface {
  name = 'AddPushSubscriptions1785300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "push_subscriptions" (
        "id" SERIAL PRIMARY KEY,
        "admin_id" INTEGER NOT NULL REFERENCES "admins" ("id") ON DELETE CASCADE,
        "endpoint" TEXT NOT NULL,
        "p256dh" TEXT NOT NULL,
        "auth" TEXT NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_push_subscriptions_endpoint" ON "push_subscriptions" ("endpoint");`);
    await queryRunner.query(`CREATE INDEX "IDX_push_subscriptions_admin_id" ON "push_subscriptions" ("admin_id");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "push_subscriptions";`);
  }
}
