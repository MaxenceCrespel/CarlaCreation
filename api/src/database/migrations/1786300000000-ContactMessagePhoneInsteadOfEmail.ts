import { MigrationInterface, QueryRunner } from 'typeorm';

export class ContactMessagePhoneInsteadOfEmail1786300000000 implements MigrationInterface {
  name = 'ContactMessagePhoneInsteadOfEmail1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The contact form now collects a phone number instead of an email
    // address. Rename in place rather than drop+add so existing messages
    // keep their contact detail (as a string) instead of losing it.
    await queryRunner.query(`ALTER TABLE "contact_messages" RENAME COLUMN "email" TO "phone";`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contact_messages" RENAME COLUMN "phone" TO "email";`);
  }
}
