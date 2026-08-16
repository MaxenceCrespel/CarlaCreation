import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClients1785800000000 implements MigrationInterface {
  name = 'AddClients1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "clients" (
        "id" SERIAL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "normalized_name" TEXT NOT NULL,
        "phone" TEXT NOT NULL DEFAULT '',
        "email" TEXT NOT NULL DEFAULT '',
        "notes" TEXT NOT NULL DEFAULT '',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_clients_normalized_name" ON "clients" ("normalized_name");`);

    await queryRunner.query(`ALTER TABLE "reservations" ADD COLUMN "client_id" INTEGER REFERENCES "clients" ("id") ON DELETE SET NULL;`);
    await queryRunner.query(`CREATE INDEX "IDX_reservations_client_id" ON "reservations" ("client_id");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reservations" DROP COLUMN "client_id";`);
    await queryRunner.query(`DROP TABLE "clients";`);
  }
}
