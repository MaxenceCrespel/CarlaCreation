import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, Repository } from 'typeorm';
import { Client } from '../../database/entities/client.entity';
import { MailService } from '../mail/mail.service';
import { PromotionsService } from '../promotions/promotions.service';
import { SettingsService } from '../settings/settings.service';

// Both rewards below reuse the exact same mechanism: generate a one-time
// Promotion code (see PromotionsService.createAutoCode) and email it — the
// booking flow's existing promo-code redemption needs no changes at all to
// support either one.
@Injectable()
export class RewardsService {
  private readonly logger = new Logger(RewardsService.name);

  constructor(
    @InjectRepository(Client) private readonly clientRepo: Repository<Client>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly settingsService: SettingsService,
    private readonly promotionsService: PromotionsService,
    private readonly mailService: MailService,
  ) {}

  // Called whenever a reservation linked to a Client (see
  // Reservation.client_id) is marked 'completed' — see
  // ReservationsService.updateStatus/updateGroupStatus. Never throws: a
  // failure here must not block the status change that triggered it.
  async checkLoyaltyReward(clientId: number): Promise<void> {
    try {
      const client = await this.clientRepo.findOne({ where: { id: clientId } });
      if (!client || !client.email) return;

      const [{ count }]: { count: string }[] = await this.dataSource.query(
        `SELECT COUNT(*)::int AS count FROM reservations WHERE client_id = $1 AND status = 'completed'`,
        [clientId],
      );
      const visitsCompleted = Number(count);
      const visitsRequired = await this.settingsService.getLoyaltyVisitsRequired();

      // A fresh multiple that hasn't already triggered a reward — the
      // stored watermark stops a webhook-style double-fire (or the same
      // count somehow being reached twice) from issuing two codes.
      if (visitsCompleted === 0 || visitsCompleted % visitsRequired !== 0) return;
      if (client.loyalty_reward_at_visits === visitsCompleted) return;

      const discountPercent = await this.settingsService.getLoyaltyDiscountPercent();
      const promotion = await this.promotionsService.createAutoCode(`Fidélité — ${client.name} (${visitsCompleted}e passage)`, discountPercent);

      await this.mailService.sendLoyaltyReward({
        clientName: client.name,
        clientEmail: client.email,
        code: promotion.code!,
        discountPercent,
        visitsCompleted,
      });

      client.loyalty_reward_at_visits = visitsCompleted;
      await this.clientRepo.save(client);
    } catch (err) {
      this.logger.error(`Loyalty reward check failed for client ${clientId}: ${(err as Error).message}`);
    }
  }

  // Runs once a day — a client's birthday only needs to be caught once
  // within the day it falls on, so a daily cadence is plenty.
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendBirthdayRewards(): Promise<void> {
    try {
      await this.dispatchBirthdayRewards();
    } catch (err) {
      this.logger.error(`Birthday reward job failed: ${(err as Error).message}`);
    }
  }

  async dispatchBirthdayRewards(): Promise<void> {
    const now = new Date();
    const monthDay = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const currentYear = now.getFullYear();

    // birthdate is 'YYYY-MM-DD' — matching on the trailing "MM-DD" ignores
    // the year (only ever used to compute the date typed at signup, never
    // shown as an age). birthday_reward_year distinct from currentYear (or
    // null) keeps this from re-emailing every day this cron runs.
    const clients: Client[] = await this.dataSource.query(
      `SELECT * FROM clients
       WHERE birthdate IS NOT NULL
         AND email != ''
         AND RIGHT(birthdate, 5) = $1
         AND (birthday_reward_year IS NULL OR birthday_reward_year != $2)`,
      [monthDay, currentYear],
    );

    const discountPercent = await this.settingsService.getBirthdayDiscountPercent();

    for (const client of clients) {
      try {
        const promotion = await this.promotionsService.createAutoCode(`Anniversaire — ${client.name} (${currentYear})`, discountPercent);
        await this.mailService.sendBirthdayReward({
          clientName: client.name,
          clientEmail: client.email,
          code: promotion.code!,
          discountPercent,
        });
        await this.clientRepo.update({ id: client.id }, { birthday_reward_year: currentYear });
      } catch (err) {
        this.logger.error(`Birthday reward failed for client ${client.id}: ${(err as Error).message}`);
      }
    }
  }
}
