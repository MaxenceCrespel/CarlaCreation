import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Client, normalizeClientName } from '../../database/entities/client.entity';
import { SettingsService } from '../settings/settings.service';
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
    private readonly settingsService: SettingsService,
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

    if (client) {
      client.name = dto.name.trim();
      client.normalized_name = normalizeClientName(dto.name);
      client.password_hash = passwordHash;
      if (dto.phone) client.phone = dto.phone.trim();
      if (dto.birthdate) client.birthdate = dto.birthdate;
    } else {
      client = this.clientRepo.create({
        name: dto.name.trim(),
        normalized_name: normalizeClientName(dto.name),
        email,
        phone: dto.phone?.trim() ?? '',
        password_hash: passwordHash,
        birthdate: dto.birthdate ?? null,
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

    const history: ReservationHistoryRow[] = await this.dataSource.query(
      `SELECT r.id, r.reservation_date, r.start_time, r.status, s.name AS service_name
       FROM reservations r JOIN services s ON s.id = r.service_id
       WHERE r.client_id = $1
       ORDER BY r.reservation_date DESC, r.start_time DESC`,
      [clientId],
    );
    const visitsCompleted = history.filter((h) => h.status === 'completed').length;
    const visitsRequired = await this.settingsService.getLoyaltyVisitsRequired();
    // How many more completed visits until the next reward — a remainder
    // of 0 means either "brand new" (0 visits) or "just hit a milestone",
    // both of which need a full fresh cycle of visitsRequired.
    const remainder = visitsCompleted % visitsRequired;
    const visitsRemaining = remainder === 0 ? visitsRequired : visitsRequired - remainder;

    return {
      name: client.name,
      email: client.email,
      phone: client.phone,
      birthdate: client.birthdate,
      history,
      loyalty: { visitsCompleted, visitsRequired, visitsRemaining },
    };
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
    return this.jwtService.sign({ sub: client.id, email: client.email }, { expiresIn: '30d' });
  }
}
