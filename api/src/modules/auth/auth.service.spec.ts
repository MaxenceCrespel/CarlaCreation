import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { Admin } from '../../database/entities/admin.entity';

describe('AuthService', () => {
  let service: AuthService;
  let adminRepo: { findOne: jest.Mock; save: jest.Mock };
  let jwtService: { sign: jest.Mock };

  beforeEach(async () => {
    adminRepo = { findOne: jest.fn(), save: jest.fn((v) => Promise.resolve(v)) };
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

  describe('updateCredentials', () => {
    const currentHash = bcrypt.hashSync('current-password', 4);

    it('rejects a wrong current password', async () => {
      adminRepo.findOne.mockResolvedValue({ id: 1, username: 'carla', password_hash: currentHash });

      await expect(
        service.updateCredentials(1, { currentPassword: 'wrong', newPassword: 'a-new-strong-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects when neither newUsername nor newPassword is provided', async () => {
      adminRepo.findOne.mockResolvedValue({ id: 1, username: 'carla', password_hash: currentHash });

      await expect(service.updateCredentials(1, { currentPassword: 'current-password' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a username that is already taken', async () => {
      adminRepo.findOne
        .mockResolvedValueOnce({ id: 1, username: 'carla', password_hash: currentHash }) // the admin being updated
        .mockResolvedValueOnce({ id: 2, username: 'taken' }); // username uniqueness check

      await expect(
        service.updateCredentials(1, { currentPassword: 'current-password', newUsername: 'taken' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws NotFoundException if the admin no longer exists', async () => {
      adminRepo.findOne.mockResolvedValue(undefined);

      await expect(
        service.updateCredentials(999, { currentPassword: 'anything', newPassword: 'a-new-strong-password' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates the username and password, and re-issues a fresh token', async () => {
      const admin = { id: 1, username: 'carla', password_hash: currentHash };
      adminRepo.findOne
        .mockResolvedValueOnce(admin) // the admin being updated
        .mockResolvedValueOnce(undefined); // username uniqueness check: free

      const result = await service.updateCredentials(1, {
        currentPassword: 'current-password',
        newUsername: 'carla2',
        newPassword: 'a-new-strong-password',
      });

      expect(result).toEqual({ token: 'signed-jwt-token', username: 'carla2' });
      expect(adminRepo.save).toHaveBeenCalledWith(expect.objectContaining({ username: 'carla2' }));
      const saved = adminRepo.save.mock.calls[0][0];
      expect(bcrypt.compareSync('a-new-strong-password', saved.password_hash)).toBe(true);
      expect(jwtService.sign).toHaveBeenCalledWith({ sub: 1, username: 'carla2' }, { expiresIn: '8h' });
    });

    it('allows changing only the password, keeping the same username', async () => {
      const admin = { id: 1, username: 'carla', password_hash: currentHash };
      adminRepo.findOne.mockResolvedValue(admin);

      const result = await service.updateCredentials(1, {
        currentPassword: 'current-password',
        newPassword: 'a-new-strong-password',
      });

      expect(result.username).toBe('carla');
      expect(adminRepo.findOne).toHaveBeenCalledTimes(1); // no uniqueness check needed
    });
  });
});
