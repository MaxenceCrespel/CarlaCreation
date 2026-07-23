import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Admin } from '../../database/entities/admin.entity';
import { UpdateCredentialsDto } from './dto/login.dto';

// A fixed dummy hash used when the username doesn't exist, so bcrypt.compare
// still runs (constant-time-ish) and a timing attack can't reveal whether a
// given username has an account.
const DUMMY_HASH = '$2a$12$invalidsaltinvalidsaltinuseonly000000000000000000000';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Admin) private readonly adminRepo: Repository<Admin>,
    private readonly jwtService: JwtService,
  ) {}

  async login(username: string, password: string): Promise<{ token: string; username: string }> {
    const admin = await this.adminRepo.findOne({ where: { username } });

    const hash = admin ? admin.password_hash : DUMMY_HASH;
    const valid = bcrypt.compareSync(password, hash);

    if (!admin || !valid) {
      throw new UnauthorizedException('Identifiants invalides.');
    }

    const token = this.jwtService.sign({ sub: admin.id, username: admin.username }, { expiresIn: '8h' });
    return { token, username: admin.username };
  }

  // Requires the current password even though the request is already
  // authenticated (AdminAuthGuard) — a stolen/left-open session shouldn't be
  // enough on its own to lock the real admin out of their own account.
  async updateCredentials(adminId: number, dto: UpdateCredentialsDto): Promise<{ token: string; username: string }> {
    const admin = await this.adminRepo.findOne({ where: { id: adminId } });
    if (!admin) {
      throw new NotFoundException('Compte introuvable.');
    }

    if (!bcrypt.compareSync(dto.currentPassword, admin.password_hash)) {
      throw new UnauthorizedException('Mot de passe actuel incorrect.');
    }

    if (!dto.newUsername && !dto.newPassword) {
      throw new BadRequestException("Indiquez un nouveau nom d'utilisateur et/ou un nouveau mot de passe.");
    }

    if (dto.newUsername && dto.newUsername !== admin.username) {
      const existing = await this.adminRepo.findOne({ where: { username: dto.newUsername } });
      if (existing) {
        throw new ConflictException("Ce nom d'utilisateur est déjà pris.");
      }
      admin.username = dto.newUsername;
    }

    if (dto.newPassword) {
      admin.password_hash = bcrypt.hashSync(dto.newPassword, 12);
    }

    await this.adminRepo.save(admin);

    // The old session's JWT still carries the previous username — re-issue
    // one now so `GET /api/auth/me` (and the cookie itself) reflect the
    // change immediately, without forcing a fresh login.
    const token = this.jwtService.sign({ sub: admin.id, username: admin.username }, { expiresIn: '8h' });
    return { token, username: admin.username };
  }
}
