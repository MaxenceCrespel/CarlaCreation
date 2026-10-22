import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Client, normalizeClientName } from '../../database/entities/client.entity';
import { RewardsService } from '../rewards/rewards.service';
import { REWARD_TIERS } from '../rewards/loyalty.constants';
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
  ) {}

  // A fiche can already exist for this email — created earlier by the
  // admin matching a guest booking, or by a previous guest booking that
  // was never turned into a fiche at all (see ClientsService). Either way,
  // signing up *claims* it rather than creating a duplicate: same person,
  // now with a password. Only refuses if that fiche already has one.
  async signup(dto: SignupDto): Promise<{ token: string; client: Client }> {
    const email = dto.email.trim().toLowerCase();
    let client = await this.clientRepo.findOne({ where: { email } });

    if (client?.password_hash) {
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
      client.name = dto.name.trim();
      client.normalized_name = normalizeClientName(dto.name);
      client.password_hash = passwordHash;
      if (dto.phone) client.phone = dto.phone.trim();
      if (dto.birthdate) client.birthdate = dto.birthdate;
      if (sponsorId && !client.referred_by_client_id) client.referred_by_client_id = sponsorId;
    } else {
      client = this.clientRepo.create({
        name: dto.name.trim(),
        normalized_name: normalizeClientName(dto.name),
        email,
        phone: dto.phone?.trim() ?? '',
        password_hash: passwordHash,
        birthdate: dto.birthdate ?? null,
        referred_by_client_id: sponsorId,
      });
    }
    await this.clientRepo.save(client);

    return { token: this.issueToken(client), client };
  }

  async login(email: string, password: string): Promise<{ token: string; client: Client }> {
    const client = await this.clientRepo.findOne({ where: { email: email.trim().toLowerCase() } });

    const hash = client?.password_hash ?? DUMMY_HASH;
    const valid = bcrypt.compareSync(password, hash);

    if (!client || !client.password_hash || !valid) {
      throw new UnauthorizedException('Identifiants invalides.');
    }

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

    return {
      name: client.name,
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
      referral: { code: client.referral_code, validatedCount: n },
      codes: codes.filter((c) => !c.used_at && (!c.expires_at || c.expires_at.getTime() > Date.now())),
    };
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

    if (dto.name !== undefined) {
      client.name = dto.name.trim();
      client.normalized_name = normalizeClientName(dto.name);
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

  private issueToken(client: Client): string {
    return this.jwtService.sign({ sub: client.id, email: client.email, role: 'client' }, { expiresIn: '30d' });
  }
}
