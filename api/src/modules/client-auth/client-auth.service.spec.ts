import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { ClientAuthService } from './client-auth.service';
import { Client } from '../../database/entities/client.entity';
import { RewardsService } from '../rewards/rewards.service';

describe('ClientAuthService', () => {
  let service: ClientAuthService;
  let clientRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let dataSource: { query: jest.Mock };
  let jwtService: { sign: jest.Mock };
  let rewardsService: { getBalance: jest.Mock; redeem: jest.Mock };

  beforeEach(async () => {
    clientRepo = { findOne: jest.fn(), create: jest.fn((v) => v), save: jest.fn((v) => Promise.resolve({ id: 1, ...v })) };
    dataSource = { query: jest.fn().mockResolvedValue([]) };
    jwtService = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
    rewardsService = { getBalance: jest.fn().mockResolvedValue(0), redeem: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientAuthService,
        { provide: getRepositoryToken(Client), useValue: clientRepo },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: JwtService, useValue: jwtService },
        { provide: RewardsService, useValue: rewardsService },
      ],
    }).compile();

    service = module.get(ClientAuthService);
  });

  describe('signup', () => {
    it('creates a brand new client when no fiche exists for that email', async () => {
      clientRepo.findOne.mockResolvedValue(null);

      const { token, client } = await service.signup({ name: 'Jeanne Dupont', email: 'jeanne@example.com', password: 'motdepasse123' });

      expect(clientRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Jeanne Dupont', email: 'jeanne@example.com', password_hash: expect.any(String) }),
      );
      expect(token).toBe('signed.jwt.token');
      expect(client.email).toBe('jeanne@example.com');
    });

    it('claims an existing admin-created fiche that has no password yet', async () => {
      clientRepo.findOne.mockResolvedValue({ id: 7, name: 'J. Dupont', email: 'jeanne@example.com', password_hash: null, phone: '0600000000' });

      const { client } = await service.signup({ name: 'Jeanne Dupont', email: 'jeanne@example.com', password: 'motdepasse123' });

      expect(client.id).toBe(7);
      expect(clientRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 7, password_hash: expect.any(String) }));
      // create() is only for a brand new row — claiming reuses the existing entity instead.
      expect(clientRepo.create).not.toHaveBeenCalled();
    });

    it('rejects signup when the fiche already has a password (already registered)', async () => {
      clientRepo.findOne.mockResolvedValue({ id: 7, email: 'jeanne@example.com', password_hash: 'already-hashed' });

      await expect(service.signup({ name: 'Jeanne Dupont', email: 'jeanne@example.com', password: 'motdepasse123' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('login', () => {
    it('logs in with correct credentials', async () => {
      const hash = bcrypt.hashSync('motdepasse123', 12);
      clientRepo.findOne.mockResolvedValue({ id: 1, email: 'jeanne@example.com', password_hash: hash });

      const { token } = await service.login('jeanne@example.com', 'motdepasse123');

      expect(token).toBe('signed.jwt.token');
    });

    it('rejects a wrong password', async () => {
      const hash = bcrypt.hashSync('motdepasse123', 12);
      clientRepo.findOne.mockResolvedValue({ id: 1, email: 'jeanne@example.com', password_hash: hash });

      await expect(service.login('jeanne@example.com', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an unknown email', async () => {
      clientRepo.findOne.mockResolvedValue(null);
      await expect(service.login('nobody@example.com', 'whatever12')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a fiche that exists but was never registered (no password set)', async () => {
      clientRepo.findOne.mockResolvedValue({ id: 1, email: 'jeanne@example.com', password_hash: null });
      await expect(service.login('jeanne@example.com', 'whatever12')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('getProfile', () => {
    it('throws NotFoundException for an unknown client', async () => {
      clientRepo.findOne.mockResolvedValue(null);
      await expect(service.getProfile(999)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('exposes the points balance, reward tiers and the next tier to reach', async () => {
      clientRepo.findOne.mockResolvedValue({ id: 1, name: 'Jeanne', email: 'j@e.com', phone: '', birthdate: null, referral_code: 'ABC234' });
      rewardsService.getBalance.mockResolvedValue(60);
      dataSource.query.mockImplementation(async (sql: string) => (sql.includes('COUNT(*)') ? [{ n: 0 }] : []));

      const profile = await service.getProfile(1);

      expect(profile.loyalty.points).toBe(60);
      expect(profile.loyalty.nextTierPoints).toBe(100);
      expect(profile.loyalty.pointsToNextTier).toBe(40);
      expect(profile.loyalty.tiers.map((t) => [t.points, t.affordable])).toEqual([[50, true], [100, false], [150, false], [250, false]]);
      expect(profile.referral.code).toBe('ABC234');
    });

    it('generates a referral code the first time the profile is loaded', async () => {
      const client = { id: 1, name: 'Jeanne', email: 'j@e.com', phone: '', birthdate: null, referral_code: null };
      clientRepo.findOne.mockImplementation(async ({ where }: { where: { id?: number } }) => (where.id ? client : null));
      dataSource.query.mockImplementation(async (sql: string) => (sql.includes('COUNT(*)') ? [{ n: 0 }] : []));

      const profile = await service.getProfile(1);

      expect(profile.referral.code).toMatch(/^[A-Z2-9]{6}$/);
      expect(clientRepo.save).toHaveBeenCalledWith(expect.objectContaining({ referral_code: profile.referral.code }));
    });
  });

  describe('signup referral', () => {
    it('links a new account to its sponsor', async () => {
      clientRepo.findOne.mockImplementation(async ({ where }: { where: { email?: string; referral_code?: string } }) =>
        where.referral_code ? { id: 9 } : null,
      );

      await service.signup({ name: 'Nouvelle', email: 'n@e.com', password: 'motdepasse123', referralCode: ' abc234 ' });

      expect(clientRepo.create).toHaveBeenCalledWith(expect.objectContaining({ referred_by_client_id: 9 }));
    });

    it('rejects an unknown referral code', async () => {
      clientRepo.findOne.mockResolvedValue(null);
      await expect(service.signup({ name: 'N', email: 'n@e.com', password: 'motdepasse123', referralCode: 'NOPE' })).rejects.toThrow('Code de parrainage invalide.');
    });

    it('ignores the referral for an existing fiche that already has completed visits', async () => {
      clientRepo.findOne.mockImplementation(async ({ where }: { where: { email?: string; referral_code?: string } }) =>
        where.referral_code ? { id: 9 } : { id: 3, name: 'Old', email: 'o@e.com', password_hash: null, phone: '' },
      );
      dataSource.query.mockResolvedValue([{ n: 2 }]);

      await service.signup({ name: 'Old', email: 'o@e.com', password: 'motdepasse123', referralCode: 'ABC234' });

      expect(clientRepo.save).toHaveBeenCalledWith(expect.not.objectContaining({ referred_by_client_id: 9 }));
    });
  });

  describe('updateProfile', () => {
    it('updates the password when the current one matches', async () => {
      const hash = bcrypt.hashSync('oldpassword', 12);
      clientRepo.findOne.mockResolvedValue({ id: 1, email: 'jeanne@example.com', password_hash: hash });

      await service.updateProfile(1, { currentPassword: 'oldpassword', newPassword: 'newpassword123' });

      expect(clientRepo.save).toHaveBeenCalledWith(expect.objectContaining({ password_hash: expect.any(String) }));
    });

    it('rejects a password change with the wrong current password', async () => {
      const hash = bcrypt.hashSync('oldpassword', 12);
      clientRepo.findOne.mockResolvedValue({ id: 1, email: 'jeanne@example.com', password_hash: hash });

      await expect(service.updateProfile(1, { currentPassword: 'wrong', newPassword: 'newpassword123' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('updates the name/phone/birthdate without touching the password', async () => {
      clientRepo.findOne.mockResolvedValue({ id: 1, name: 'Old Name', email: 'jeanne@example.com', password_hash: 'unchanged', phone: '' });

      await service.updateProfile(1, { name: 'New Name', birthdate: '1990-05-12' });

      expect(clientRepo.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Name', birthdate: '1990-05-12', password_hash: 'unchanged' }));
    });
  });
});
