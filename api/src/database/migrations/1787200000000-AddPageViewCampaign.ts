import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPageViewCampaign1787200000000 implements MigrationInterface {
  name = 'AddPageViewCampaign1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The channel a link was tagged with (?src=instagram, ?src=whatsapp...) —
    // links opened from apps carry no referrer, so they all looked "direct".
    await queryRunner.query(`ALTER TABLE "page_views" ADD COLUMN "campaign" TEXT;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "page_views" DROP COLUMN "campaign";`);
  }
}
