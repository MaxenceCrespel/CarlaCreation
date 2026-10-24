import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountLifecycle1787000000000 implements MigrationInterface {
  name = 'AddAccountLifecycle1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clients" ADD COLUMN "email_verified_at" TIMESTAMPTZ;`);
    await queryRunner.query(`ALTER TABLE "clients" ADD COLUMN "last_login_at" TIMESTAMPTZ;`);
    await queryRunner.query(`ALTER TABLE "clients" ADD COLUMN "purge_warned_at" TIMESTAMPTZ;`);

    // Accounts that already exist predate email verification: grandfather
    // them in (verified) and start their inactivity clock now.
    await queryRunner.query(
      `UPDATE "clients" SET "email_verified_at" = now(), "last_login_at" = now() WHERE "password_hash" IS NOT NULL;`,
    );

    // Single-use verification / password-reset tokens — only the SHA-256 of
    // the token is stored, the raw value only ever travels by email.
    await queryRunner.query(`
      CREATE TABLE "client_tokens" (
        "id" SERIAL PRIMARY KEY,
        "client_id" INTEGER NOT NULL REFERENCES "clients" ("id") ON DELETE CASCADE,
        "type" TEXT NOT NULL,
        "token_hash" TEXT NOT NULL UNIQUE,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "used_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_client_tokens_client_id" ON "client_tokens" ("client_id");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "client_tokens";`);
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "purge_warned_at";`);
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "last_login_at";`);
    await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "email_verified_at";`);
  }
}
