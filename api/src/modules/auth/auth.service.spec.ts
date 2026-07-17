import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { Admin } from '../../database/entities/admin.entity';

describe('AuthService', () => {
  let service: AuthService;
  let adminRepo: { findOne: jest.Mock };
  let jwtService: { sign: jest.Mock };

  beforeEach(async () => {
    adminRepo = { findOne: jest.fn() };
    jwtService = { sign: jest.fn().mockReturnValue('signed-jwt-token') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(Admin), useValue: adminRepo },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('logs in successfully with correct credentials', async () => {
    const hash = bcrypt.hashSync('correct-password', 4);
    adminRepo.findOne.mockResolvedValue({ id: 1, username: 'admin', password_hash: hash });

    const result = await service.login('admin', 'correct-password');

    expect(result).toEqual({ token: 'signed-jwt-token', username: 'admin' });
    expect(jwtService.sign).toHaveBeenCalledWith({ sub: 1, username: 'admin' }, { expiresIn: '8h' });
  });

  it('rejects a wrong password', async () => {
    const hash = bcrypt.hashSync('correct-password', 4);
    adminRepo.findOne.mockResolvedValue({ id: 1, username: 'admin', password_hash: hash });

    await expect(service.login('admin', 'wrong-password')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unknown username (still runs bcrypt against a dummy hash)', async () => {
    adminRepo.findOne.mockResolvedValue(undefined);

    await expect(service.login('nobody', 'whatever')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
