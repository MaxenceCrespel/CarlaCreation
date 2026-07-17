import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Admin } from '../../database/entities/admin.entity';

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
}
