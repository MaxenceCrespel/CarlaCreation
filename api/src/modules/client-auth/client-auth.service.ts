import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Client, joinName, normalizeClientName, splitName } from '../../database/entities/client.entity';
import { RewardsService } from '../rewards/rewards.service';
import { REWARD_TIERS } from '../rewards/loyalty.constants';
import { AccountLifecycleService } from './account-lifecycle.service';
import { SignupDto, UpdateClientProfileDto } from './dto/client-auth.dto';

// Same rationale as AuthService's DUMMY_HASH — keeps a login attempt's
// timing (and error message) identical whether the email doesn't exist at
// all, or exists but was never registered (an admin-only "fiche").
const DUMMY_HASH = '$2a$12$invalidsaltinvalidsaltinuseonly000000000000000000000';

interface ReservationHistoryRow {
  id: number;
  reservation_date: string;
  start_time: string;
  service_name: string;
  status: string;
}

@Injectable()
export class ClientAuthService {
  constructor(
    @InjectRepository(Client) private readonly clientRepo: Repository<Client>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly rewardsService: RewardsService,
    private readonly lifecycle: AccountLifecycleService,
  ) {}

  // A fiche can already exist for this email — created earlier by the
  // admin matching a guest booking, or by a previous guest booking that
  // was never turned into a fiche at all (see ClientsService). Either way,
  // signing up *claims* it rather than creating a duplicate: same person,
  // now with a password. Only refuses if that fiche already has one.
  //
  // Signing up never logs anyone in: the account only becomes usable once
  // the emailed link is clicked (see AccountLifecycleService.verifyEmail).
  // This is also what stops someone from claiming a fiche with an email
  // that isn't theirs. A pending (unverified) account can be re-registered
  // over, so a typo'd or hijacked signup never locks the real owner out.
  async signup(dto: SignupDto): Promise<{ client: Client }> {
    const email = dto.email.trim().toLowerCase();
    const fullName = joinName(dto.firstName, dto.lastName);
    let client = await this.clientRepo.findOne({ where: { email } });

    if (client?.password_hash && client.email_verified_at) {
      throw new ConflictException('Un compte existe déjà avec cet email — connectez-vous.');
    }

    const passwordHash = bcrypt.hashSync(dto.password, 12);

    // The referral only counts for someone genuinely new: a claimed fiche
    // that already has completed visits is not "joining".
    let sponsorId: number | null = null;
    if (dto.referralCode?.trim()) {
      const sponsor = await this.clientRepo.findOne({ where: { referral_code: dto.referralCode.trim().toUpperCase() } });
      if (!sponsor) throw new BadRequestException('Code de parrainage invalide.');
      const alreadyClient = client
        ? Number((await this.dataSource.query(`SELECT COUNT(*)::int AS n FROM reservations WHERE client_id = $1 AND status = 'completed'`, [client.id]))[0].n) > 0
        : false;
      if (!alreadyClient && sponsor.id !== client?.id) sponsorId = sponsor.id;
    }

    if (client) {
      client.name = fullName;
      client.first_name = dto.firstName.trim();
      client.last_name = dto.lastName.trim();
      client.normalized_name = normalizeClientName(fullName);
      client.password_hash = passwordHash;
      client.email_verified_at = null;
      client.phone = dto.phone.trim();
      if (dto.birthdate) client.birthdate = dto.birthdate;
      if (sponsorId && !client.referred_by_client_id) client.referred_by_client_id = sponsorId;
    } else {
      client = this.clientRepo.create({
        name: fullName,
        first_name: dto.firstName.trim(),
        last_name: dto.lastName.trim(),
        normalized_name: normalizeClientName(fullName),
        email,
        phone: dto.phone.trim(),
        password_hash: passwordHash,
        birthdate: dto.birthdate ?? null,
        referred_by_client_id: sponsorId,
      });
    }
    client = await this.clientRepo.save(client);
    await this.lifecycle.sendVerificationEmail(client);

    return { client };
  }

  async login(email: string, password: string): Promise<{ token: string; client: Client }> {
    const client = await this.clientRepo.findOne({ where: { email: email.trim().toLowerCase() } });

    const hash = client?.password_hash ?? DUMMY_HASH;
    const valid = bcrypt.compareSync(password, hash);

    if (!client || !client.password_hash || !valid) {
      throw new UnauthorizedException('Identifiants invalides.');
    }
    if (!client.email_verified_at) {
      throw new ForbiddenException({
        message: 'Confirmez votre adresse email : un lien vous a été envoyé à la création du compte.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    await this.recordLogin(client);
    return { token: this.issueToken(client), client };
  }

  async getProfile(clientId: number) {
    const client = await this.clientRepo.findOne({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Compte introuvable.');

    if (!client.referral_code) {
      client.referral_code = await this.generateReferralCode();
      await this.clientRepo.save(client);
    }

    const history: ReservationHistoryRow[] = await this.dataSource.query(
      `SELECT r.id, r.reservation_date, r.start_time, r.status, s.name AS service_name
       FROM reservations r JOIN services s ON s.id = r.service_id
       WHERE r.client_id = $1
       ORDER BY r.reservation_date DESC, r.start_time DESC`,
      [clientId],
    );
    const points = await this.rewardsService.getBalance(clientId);
    const nextTier = REWARD_TIERS.find((t) => t.points > points) ?? null;

    // Personal codes (loyalty redemptions, birthday): shown so a code lost
    // from an email can be found again.
    const codes: { code: string; label: string; discount_percent: number; discount_cents: number | null; expires_at: Date | null; used_at: Date | null }[] =
      await this.dataSource.query(
        `SELECT code, label, discount_percent, discount_cents, expires_at, used_at FROM promotions
         WHERE client_id = $1 AND active = true ORDER BY created_at DESC LIMIT 20`,
        [clientId],
      );
    const [{ n }]: { n: number }[] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS n FROM clients WHERE referred_by_client_id = $1 AND referral_rewarded_at IS NOT NULL`,
      [clientId],
    );

    const { firstName, lastName } = client.first_name != null ? { firstName: client.first_name, lastName: client.last_name ?? '' } : splitName(client.name);
    return {
      name: client.name,
      firstName,
      lastName,
      email: client.email,
      phone: client.phone,
      birthdate: client.birthdate,
      history,
      loyalty: {
        points,
        tiers: REWARD_TIERS.map((t) => ({ points: t.points, amountCents: t.amountCents, affordable: points >= t.points })),
        pointsToNextTier: nextTier ? nextTier.points - points : 0,
        nextTierPoints: nextTier?.points ?? null,
      },
      referral: {
        code: client.referral_code,
        validatedCount: n,
        canApplyCode: !client.referred_by_client_id && !(await this.hasCompletedVisit(clientId)),
      },
      codes: codes.filter((c) => !c.used_at && (!c.expires_at || c.expires_at.getTime() > Date.now())),
    };
  }

  // A referral code can also be entered after signup (profile page, or while
  // booking) — under the same rules as at signup: only for someone who isn't
  // already sponsored and hasn't had a completed visit yet ("joining"), and
  // never one's own code. The points still only move once the first visit
  // is marked completed (RewardsService.onReservationsCompleted).
  async applyReferralCode(clientId: number, rawCode: string): Promise<void> {
    const client = await this.clientRepo.findOne({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Compte introuvable.');
    if (client.referred_by_client_id) throw new BadRequestException('Un code de parrainage est déjà enregistré sur votre compte.');
    if (await this.hasCompletedVisit(clientId)) {
      throw new BadRequestException('Le parrainage est réservé aux nouveaux clients (avant un premier rendez-vous terminé).');
    }
    const sponsor = await this.clientRepo.findOne({ where: { referral_code: rawCode.trim().toUpperCase() } });
    if (!sponsor) throw new BadRequestException('Code de parrainage invalide.');
    if (sponsor.id === clientId) throw new BadRequestException('Vous ne pouvez pas utiliser votre propre code.');
    client.referred_by_client_id = sponsor.id;
    await this.clientRepo.save(client);
  }

  private async hasCompletedVisit(clientId: number): Promise<boolean> {
    const [{ n }]: { n: number }[] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS n FROM reservations WHERE client_id = $1 AND status = 'completed'`,
      [clientId],
    );
    return Number(n) > 0;
  }

  redeemReward(clientId: number, points: number) {
    return this.rewardsService.redeem(clientId, points);
  }

  private async generateReferralCode(): Promise<string> {
    // Same unambiguous alphabet as promo codes (no 0/O/1/I).
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      let code = '';
      for (let i = 0; i < 6; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
      if (!(await this.clientRepo.findOne({ where: { referral_code: code } }))) return code;
    }
    throw new BadRequestException('Impossible de générer un code de parrainage, réessayez.');
  }

  async updateProfile(clientId: number, dto: UpdateClientProfileDto): Promise<{ token: string; client: Client }> {
    const client = await this.clientRepo.findOne({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Compte introuvable.');

    if (dto.firstName !== undefined || dto.lastName !== undefined) {
      const current = client.first_name != null ? { firstName: client.first_name, lastName: client.last_name ?? '' } : splitName(client.name);
      client.first_name = (dto.firstName ?? current.firstName).trim();
      client.last_name = (dto.lastName ?? current.lastName).trim();
      client.name = joinName(client.first_name, client.last_name);
      client.normalized_name = normalizeClientName(client.name);
    }
    if (dto.phone !== undefined) client.phone = dto.phone.trim();
    if (dto.birthdate !== undefined) client.birthdate = dto.birthdate;

    if (dto.newPassword) {
      if (!dto.currentPassword || !bcrypt.compareSync(dto.currentPassword, client.password_hash ?? DUMMY_HASH)) {
        throw new UnauthorizedException('Mot de passe actuel incorrect.');
      }
      client.password_hash = bcrypt.hashSync(dto.newPassword, 12);
    }

    await this.clientRepo.save(client);
    return { token: this.issueToken(client), client };
  }

  // Resets the inactivity clock (and any pending "your account will be
  // erased" warning).
  async recordLogin(client: Client): Promise<void> {
    await this.clientRepo.update({ id: client.id }, { last_login_at: new Date(), purge_warned_at: null });
  }

  issueToken(client: Client): string {
    return this.jwtService.sign({ sub: client.id, email: client.email, role: 'client' }, { expiresIn: '30d' });
  }
}
