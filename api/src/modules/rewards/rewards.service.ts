import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, Repository } from 'typeorm';
import { Client } from '../../database/entities/client.entity';
import { MailService } from '../mail/mail.service';
import { PromotionsService } from '../promotions/promotions.service';
import { SettingsService } from '../settings/settings.service';
import { BIRTHDAY_CODE_VALID_MONTHS, CENTS_PER_POINT, REFERRAL_REFEREE_POINTS, REFERRAL_SPONSOR_POINTS, REWARD_TIERS } from './loyalty.constants';

// Points are an append-only ledger (loyalty_points): earned rows are
// positive, redemptions negative. Every earning carries a dedupe_key so
// re-marking a reservation "completed" can never pay twice. Rewards are
// delivered as single-use personal promo codes (see PromotionsService
// .createAutoCode), so the booking flow stays the one place discounts apply.
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

  async getBalance(clientId: number): Promise<number> {
    const [{ total }]: { total: string }[] = await this.dataSource.query(
      `SELECT COALESCE(SUM(points), 0)::int AS total FROM loyalty_points WHERE client_id = $1`,
      [clientId],
    );
    return Number(total);
  }

  // Called when reservations are marked 'completed' (see ReservationsService
  // .updateStatus/updateGroupStatus). Never throws: it must not block the
  // status change that triggered it.
  async onReservationsCompleted(reservationIds: number[]): Promise<void> {
    try {
      if (reservationIds.length === 0) return;
      const rows: { id: number; client_id: number | null; price_cents: number; addons_cents: string; discount_percent: number; discount_cents: number }[] =
        await this.dataSource.query(
          `SELECT r.id, r.client_id, s.price_cents, r.discount_percent, r.discount_cents,
                  COALESCE((SELECT SUM(extra_price_cents) FROM reservation_addons a WHERE a.reservation_id = r.id), 0) AS addons_cents
           FROM reservations r JOIN services s ON s.id = r.service_id
           WHERE r.id = ANY($1) AND r.client_id IS NOT NULL`,
          [reservationIds],
        );

      const clientIds = new Set<number>();
      for (const r of rows) {
        const net = Math.max(0, Math.round((r.price_cents + Number(r.addons_cents)) * (1 - r.discount_percent / 100)) - r.discount_cents);
        const points = Math.floor(net / CENTS_PER_POINT);
        if (points > 0) {
          await this.addPoints(r.client_id!, points, 'purchase', `purchase:${r.id}`);
        }
        clientIds.add(r.client_id!);
      }
      for (const clientId of clientIds) {
        await this.rewardReferral(clientId);
      }
    } catch (err) {
      this.logger.error(`Points award failed for reservations ${reservationIds.join(',')}: ${(err as Error).message}`);
    }
  }

  private async addPoints(clientId: number, points: number, reason: string, dedupeKey: string): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO loyalty_points (client_id, points, reason, dedupe_key) VALUES ($1, $2, $3, $4) ON CONFLICT (dedupe_key) DO NOTHING`,
      [clientId, points, reason, dedupeKey],
    );
  }

  // The referral is "validated" by the referee's first completed
  // reservation (this runs from onReservationsCompleted only).
  private async rewardReferral(refereeId: number): Promise<void> {
    const referee = await this.clientRepo.findOne({ where: { id: refereeId } });
    if (!referee?.referred_by_client_id || referee.referral_rewarded_at) return;
    const sponsor = await this.clientRepo.findOne({ where: { id: referee.referred_by_client_id } });
    if (!sponsor) return;

    await this.addPoints(sponsor.id, REFERRAL_SPONSOR_POINTS, 'referral_sponsor', `referral:sponsor:${refereeId}`);
    await this.addPoints(referee.id, REFERRAL_REFEREE_POINTS, 'referral_referee', `referral:referee:${refereeId}`);
    await this.clientRepo.update({ id: refereeId }, { referral_rewarded_at: new Date() });
  }

  // Exchanges points for a single-use euro code. The balance check and the
  // debit happen under a row lock so two concurrent redemptions can't both
  // spend the same points.
  async redeem(clientId: number, points: number): Promise<{ code: string; amountCents: number }> {
    const tier = REWARD_TIERS.find((t) => t.points === points);
    if (!tier) throw new BadRequestException('Palier de récompense invalide.');

    const client = await this.clientRepo.findOne({ where: { id: clientId } });
    if (!client) throw new BadRequestException('Compte introuvable.');

    const promotion = await this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT id FROM clients WHERE id = $1 FOR UPDATE`, [clientId]);
      const [{ total }]: { total: string }[] = await manager.query(
        `SELECT COALESCE(SUM(points), 0)::int AS total FROM loyalty_points WHERE client_id = $1`,
        [clientId],
      );
      if (Number(total) < tier.points) throw new BadRequestException("Vous n'avez pas assez de points pour cette récompense.");

      await manager.query(`INSERT INTO loyalty_points (client_id, points, reason) VALUES ($1, $2, 'redeem')`, [clientId, -tier.points]);
      return this.promotionsService.createAutoCode(`Fidélité — ${client.name} (${tier.points} pts)`, 0, clientId, { amountCents: tier.amountCents, manager });
    });

    if (client.email) {
      await this.mailService.sendRedeemedReward({ clientName: client.name, clientEmail: client.email, code: promotion.code!, amountCents: tier.amountCents });
    }
    return { code: promotion.code!, amountCents: tier.amountCents };
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
    // the year. birthday_reward_year distinct from currentYear (or null)
    // keeps this from re-emailing every day this cron runs.
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
        const expiresAt = new Date(now);
        expiresAt.setMonth(expiresAt.getMonth() + BIRTHDAY_CODE_VALID_MONTHS);
        const promotion = await this.promotionsService.createAutoCode(`Anniversaire — ${client.name} (${currentYear})`, discountPercent, client.id, { expiresAt });
        await this.mailService.sendBirthdayReward({
          clientName: client.name,
          clientEmail: client.email,
          code: promotion.code!,
          discountPercent,
          validUntil: expiresAt,
        });
        await this.clientRepo.update({ id: client.id }, { birthday_reward_year: currentYear });
      } catch (err) {
        this.logger.error(`Birthday reward failed for client ${client.id}: ${(err as Error).message}`);
      }
    }
  }
}
