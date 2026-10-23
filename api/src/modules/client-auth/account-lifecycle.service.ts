import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { createHash, randomBytes } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { config } from '../../config';
import { Client } from '../../database/entities/client.entity';
import { ClientToken, ClientTokenType } from '../../database/entities/client-token.entity';
import { MailService } from '../mail/mail.service';
import { eraseClientData } from '../clients/erase-client';
import {
  INACTIVITY_YEARS,
  PURGE_WARNING_DAYS,
  RESET_PASSWORD_TTL_MS,
  UNVERIFIED_SIGNUP_DAYS,
  VERIFY_EMAIL_TTL_MS,
} from './retention.constants';

const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex');

// Email verification, password reset, account deletion/export and the
// automatic erasure of inactive accounts.
@Injectable()
export class AccountLifecycleService {
  private readonly logger = new Logger(AccountLifecycleService.name);

  constructor(
    @InjectRepository(Client) private readonly clientRepo: Repository<Client>,
    @InjectRepository(ClientToken) private readonly tokenRepo: Repository<ClientToken>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly mailService: MailService,
  ) {}

  // ----- tokens -----

  private async issueToken(clientId: number, type: ClientTokenType, ttlMs: number): Promise<string> {
    // One live token per type — a new request invalidates the previous link.
    await this.tokenRepo.delete({ client_id: clientId, type });
    const raw = randomBytes(32).toString('hex');
    await this.tokenRepo.save(
      this.tokenRepo.create({ client_id: clientId, type, token_hash: hashToken(raw), expires_at: new Date(Date.now() + ttlMs), used_at: null }),
    );
    return raw;
  }

  // Consumes a token atomically: the UPDATE only matches an unused, unexpired
  // one, so a link can never be used twice even with concurrent requests.
  private async consumeToken(raw: string, type: ClientTokenType): Promise<number> {
    // With RETURNING, the pg driver hands UPDATE results back as [rows, count].
    const result = await this.dataSource.query(
      `UPDATE client_tokens SET used_at = now()
       WHERE token_hash = $1 AND type = $2 AND used_at IS NULL AND expires_at > now()
       RETURNING client_id`,
      [hashToken(raw), type],
    );
    const rows: { client_id: number }[] = Array.isArray(result[0]) ? result[0] : result;
    if (!rows.length) throw new BadRequestException('Ce lien est invalide ou a expiré.');
    return rows[0].client_id;
  }

  // ----- email verification -----

  async sendVerificationEmail(client: Client): Promise<void> {
    if (!client.email) return;
    const token = await this.issueToken(client.id, 'verify_email', VERIFY_EMAIL_TTL_MS);
    await this.mailService.sendEmailVerification({
      clientName: client.name,
      clientEmail: client.email,
      link: `${config.PUBLIC_ORIGIN}/verification-email?token=${token}`,
    });
  }

  async verifyEmail(rawToken: string): Promise<Client> {
    const clientId = await this.consumeToken(rawToken, 'verify_email');
    const client = await this.clientRepo.findOne({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Compte introuvable.');
    client.email_verified_at = client.email_verified_at ?? new Date();
    client.last_login_at = new Date();
    return this.clientRepo.save(client);
  }

  // Always resolves without revealing whether the address has an account.
  async resendVerification(email: string): Promise<void> {
    const client = await this.clientRepo.findOne({ where: { email: email.trim().toLowerCase() } });
    if (client?.password_hash && !client.email_verified_at) await this.sendVerificationEmail(client);
  }

  // ----- password reset -----

  async requestPasswordReset(email: string): Promise<void> {
    const client = await this.clientRepo.findOne({ where: { email: email.trim().toLowerCase() } });
    if (!client?.password_hash) return;
    const token = await this.issueToken(client.id, 'reset_password', RESET_PASSWORD_TTL_MS);
    await this.mailService.sendPasswordReset({
      clientName: client.name,
      clientEmail: client.email,
      link: `${config.PUBLIC_ORIGIN}/mot-de-passe-oublie?token=${token}`,
    });
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const clientId = await this.consumeToken(rawToken, 'reset_password');
    // Reaching this link proves the mailbox is theirs, so it also verifies it.
    await this.clientRepo.update(
      { id: clientId },
      { password_hash: bcrypt.hashSync(newPassword, 12), email_verified_at: new Date() },
    );
    await this.tokenRepo.delete({ client_id: clientId, type: 'reset_password' });
  }

  // ----- deletion & export -----

  async deleteOwnAccount(clientId: number, password: string): Promise<void> {
    const client = await this.clientRepo.findOne({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Compte introuvable.');
    if (!client.password_hash || !bcrypt.compareSync(password, client.password_hash)) {
      throw new UnauthorizedException('Mot de passe incorrect.');
    }
    await this.dataSource.transaction((manager) => eraseClientData(manager, clientId));
    if (client.email) await this.mailService.sendAccountDeleted({ clientName: client.name, clientEmail: client.email });
  }

  async exportData(clientId: number) {
    const client = await this.clientRepo.findOne({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Compte introuvable.');
    const reservations = await this.dataSource.query(
      `SELECT r.id, r.reservation_date, r.start_time, r.end_time, r.status, r.client_name, r.client_email,
              r.client_phone, r.client_address, r.at_client_home, r.notes, r.discount_cents, r.created_at,
              s.name AS service_name
       FROM reservations r JOIN services s ON s.id = r.service_id
       WHERE r.client_id = $1 ORDER BY r.reservation_date DESC, r.start_time DESC`,
      [clientId],
    );
    const points = await this.dataSource.query(
      `SELECT points, reason, created_at FROM loyalty_points WHERE client_id = $1 ORDER BY created_at`,
      [clientId],
    );
    const codes = await this.dataSource.query(
      `SELECT code, label, discount_percent, discount_cents, expires_at, used_at, created_at FROM promotions WHERE client_id = $1`,
      [clientId],
    );
    return {
      exportedAt: new Date().toISOString(),
      profile: {
        name: client.name,
        email: client.email,
        phone: client.phone,
        birthdate: client.birthdate,
        referralCode: client.referral_code,
        emailVerifiedAt: client.email_verified_at,
        lastLoginAt: client.last_login_at,
        createdAt: client.created_at,
      },
      reservations,
      loyaltyPoints: points,
      promotionCodes: codes,
    };
  }

  // ----- scheduled retention -----

  @Cron('30 3 * * *')
  async runRetentionJobs(): Promise<void> {
    try {
      await this.cleanupUnverifiedSignups();
      await this.warnInactiveAccounts();
      await this.purgeInactiveAccounts();
      await this.purgeOldContactMessages();
    } catch (err) {
      this.logger.error(`Retention job failed: ${(err as Error).message}`);
    }
  }

  // A signup whose link was never clicked: drop the password so the account
  // can't be used, and delete the fiche entirely if nothing else hangs off it.
  async cleanupUnverifiedSignups(): Promise<void> {
    const stale: { id: number }[] = await this.dataSource.query(
      `SELECT id FROM clients
       WHERE password_hash IS NOT NULL AND email_verified_at IS NULL
         AND updated_at < now() - make_interval(days => $1)`,
      [UNVERIFIED_SIGNUP_DAYS],
    );
    for (const { id } of stale) {
      const [{ n }]: { n: number }[] = await this.dataSource.query(
        `SELECT (SELECT COUNT(*) FROM reservations WHERE client_id = $1) + (SELECT COUNT(*) FROM loyalty_points WHERE client_id = $1) AS n`,
        [id],
      );
      if (Number(n) === 0) await this.dataSource.transaction((m) => eraseClientData(m, id));
      else await this.dataSource.query(`UPDATE clients SET password_hash = NULL WHERE id = $1`, [id]);
    }
  }

  // Inactivity = no login for INACTIVITY_YEARS (an account that never logged
  // in counts from its creation). Fiches without an account have no login to
  // measure: they count from their last reservation, or creation.
  private inactivityCutoffSql(extraDays = 0): string {
    return `(CASE WHEN c.password_hash IS NOT NULL
        THEN COALESCE(c.last_login_at, c.created_at)
        ELSE GREATEST(c.created_at, COALESCE((SELECT MAX(r.created_at) FROM reservations r WHERE r.client_id = c.id), c.created_at))
      END) < now() - interval '${INACTIVITY_YEARS} years' + interval '${extraDays} days'`;
  }

  async warnInactiveAccounts(): Promise<void> {
    const due: Client[] = await this.dataSource.query(
      `SELECT c.* FROM clients c
       WHERE c.password_hash IS NOT NULL AND c.email <> '' AND c.purge_warned_at IS NULL
         AND ${this.inactivityCutoffSql(PURGE_WARNING_DAYS)}`,
    );
    for (const client of due) {
      await this.mailService.sendInactivityWarning({
        clientName: client.name,
        clientEmail: client.email,
        loginLink: `${config.PUBLIC_ORIGIN}/mon-compte`,
        days: PURGE_WARNING_DAYS,
      });
      await this.clientRepo.update({ id: client.id }, { purge_warned_at: new Date() });
    }
  }

  async purgeInactiveAccounts(): Promise<void> {
    // Accounts with an email are only erased once the warning has been out
    // long enough; fiches / accounts with no way to warn are erased directly.
    const due: { id: number }[] = await this.dataSource.query(
      `SELECT c.id FROM clients c
       WHERE ${this.inactivityCutoffSql(0)}
         AND (c.password_hash IS NULL OR c.email = ''
              OR (c.purge_warned_at IS NOT NULL AND c.purge_warned_at < now() - interval '${PURGE_WARNING_DAYS - 5} days'))`,
    );
    for (const { id } of due) {
      try {
        await this.dataSource.transaction((m) => eraseClientData(m, id));
        this.logger.log(`Erased inactive client ${id}`);
      } catch (err) {
        this.logger.error(`Failed to erase client ${id}: ${(err as Error).message}`);
      }
    }
  }

  async purgeOldContactMessages(): Promise<void> {
    await this.dataSource.query(`DELETE FROM contact_messages WHERE created_at < now() - interval '${INACTIVITY_YEARS} years'`);
  }
}
