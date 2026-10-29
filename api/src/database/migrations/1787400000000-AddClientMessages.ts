import { MigrationInterface, QueryRunner } from 'typeorm';

// One conversation per client account (client <-> salon). Rows go away
// with the client (ON DELETE CASCADE) — the photo files are removed by
// eraseClientData.
export class AddClientMessages1787400000000 implements MigrationInterface {
  name = 'AddClientMessages1787400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "client_messages" (
        "id" SERIAL PRIMARY KEY,
        "client_id" INTEGER NOT NULL REFERENCES "clients" ("id") ON DELETE CASCADE,
        "sender" TEXT NOT NULL CHECK ("sender" IN ('client', 'admin')),
        "body" TEXT NOT NULL DEFAULT '',
        "photo" TEXT,
        "reservation_id" INTEGER REFERENCES "reservations" ("id") ON DELETE SET NULL,
        "read_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_client_messages_client_created" ON "client_messages" ("client_id", "created_at");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "client_messages";`);
  }
}
