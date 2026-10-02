import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { ClientAuthService } from './client-auth.service';
import { Client } from '../../database/entities/client.entity';
import { SettingsService } from '../settings/settings.service';

describe('ClientAuthService', () => {
  let service: ClientAuthService;
  let clientRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let dataSource: { query: jest.Mock };
  let jwtService: { sign: jest.Mock };
  let settingsService: { getLoyaltyVisitsRequired: jest.Mock };

  beforeEach(async () => {
    clientRepo = { findOne: jest.fn(), create: jest.fn((v) => v), save: jest.fn((v) => Promise.resolve({ id: 1, ...v })) };
    dataSource = { query: jest.fn().mockResolvedValue([]) };
    jwtService = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
    settingsService = { getLoyaltyVisitsRequired: jest.fn().mockResolvedValue(5) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientAuthService,
        { provide: getRepositoryToken(Client), useValue: clientRepo },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: JwtService, useValue: jwtService },
        { provide: SettingsService, useValue: settingsService },
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

    it('computes loyalty progress from the completed-visit history', async () => {
      clientRepo.findOne.mockResolvedValue({ id: 1, name: 'Jeanne', email: 'jeanne@example.com', phone: '', birthdate: null });
      dataSource.query.mockResolvedValue([
        { id: 1, status: 'completed' },
        { id: 2, status: 'completed' },
        { id: 3, status: 'cancelled' },
      ]);

      const profile = await service.getProfile(1);

      expect(profile.loyalty).toEqual({ visitsCompleted: 2, visitsRequired: 5, visitsRemaining: 3 });
    });

    it('reports a full fresh cycle remaining right after hitting a milestone', async () => {
      clientRepo.findOne.mockResolvedValue({ id: 1, name: 'Jeanne', email: 'jeanne@example.com', phone: '', birthdate: null });
      dataSource.query.mockResolvedValue(Array.from({ length: 5 }, (_, i) => ({ id: i, status: 'completed' })));

      const profile = await service.getProfile(1);

      expect(profile.loyalty).toEqual({ visitsCompleted: 5, visitsRequired: 5, visitsRemaining: 5 });
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
