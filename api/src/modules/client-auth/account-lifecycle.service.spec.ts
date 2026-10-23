import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AccountLifecycleService } from './account-lifecycle.service';
import { Client } from '../../database/entities/client.entity';
import { ClientToken } from '../../database/entities/client-token.entity';
import { MailService } from '../mail/mail.service';

describe('AccountLifecycleService', () => {
  let service: AccountLifecycleService;
  let clientRepo: { findOne: jest.Mock; save: jest.Mock; update: jest.Mock };
  let tokenRepo: { delete: jest.Mock; save: jest.Mock; create: jest.Mock };
  let dataSource: { query: jest.Mock; transaction: jest.Mock };
  let mail: Record<string, jest.Mock>;
  let manager: { query: jest.Mock };

  beforeEach(async () => {
    clientRepo = { findOne: jest.fn(), save: jest.fn((v) => Promise.resolve(v)), update: jest.fn() };
    tokenRepo = { delete: jest.fn(), save: jest.fn(), create: jest.fn((v) => v) };
    manager = { query: jest.fn().mockResolvedValue([{ email: 'j@e.com' }]) };
    dataSource = { query: jest.fn().mockResolvedValue([]), transaction: jest.fn((fn) => fn(manager)) };
    mail = {
      sendEmailVerification: jest.fn(),
      sendPasswordReset: jest.fn(),
      sendAccountDeleted: jest.fn(),
      sendInactivityWarning: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountLifecycleService,
        { provide: getRepositoryToken(Client), useValue: clientRepo },
        { provide: getRepositoryToken(ClientToken), useValue: tokenRepo },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: MailService, useValue: mail },
      ],
    }).compile();
    service = module.get(AccountLifecycleService);
  });

  it('emails a verification link and stores only the token hash', async () => {
    await service.sendVerificationEmail({ id: 1, name: 'Jeanne', email: 'j@e.com' } as Client);

    const { link } = mail.sendEmailVerification.mock.calls[0][0];
    const raw = link.split('token=')[1];
    expect(raw).toHaveLength(64);
    expect(tokenRepo.save).toHaveBeenCalledWith(expect.objectContaining({ type: 'verify_email', token_hash: expect.not.stringContaining(raw) }));
  });

  it('rejects an invalid / expired / already-used token', async () => {
    dataSource.query.mockResolvedValue([]);
    await expect(service.verifyEmail('x'.repeat(40))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reads the [rows, count] shape the pg driver returns for UPDATE ... RETURNING', async () => {
    dataSource.query.mockResolvedValue([[{ client_id: 4 }], 1]);
    clientRepo.findOne.mockResolvedValue({ id: 4, email_verified_at: null });
    await expect(service.verifyEmail('t'.repeat(40))).resolves.toMatchObject({ id: 4 });
    dataSource.query.mockResolvedValue([[], 0]);
    await expect(service.verifyEmail('t'.repeat(40))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('verifies the email and restarts the inactivity clock', async () => {
    dataSource.query.mockResolvedValue([{ client_id: 4 }]);
    clientRepo.findOne.mockResolvedValue({ id: 4, email_verified_at: null });

    const client = await service.verifyEmail('t'.repeat(40));

    expect(client.email_verified_at).toBeInstanceOf(Date);
    expect(client.last_login_at).toBeInstanceOf(Date);
  });

  it('does not reveal whether an email has an account when requesting a reset', async () => {
    clientRepo.findOne.mockResolvedValue(null);
    await expect(service.requestPasswordReset('nobody@e.com')).resolves.toBeUndefined();
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('sends a reset link to a registered account', async () => {
    clientRepo.findOne.mockResolvedValue({ id: 2, name: 'Jeanne', email: 'j@e.com', password_hash: 'h' });
    await service.requestPasswordReset('J@e.com');
    expect(mail.sendPasswordReset).toHaveBeenCalledWith(expect.objectContaining({ clientEmail: 'j@e.com' }));
  });

  it('resets the password, marks the email verified and drops the tokens', async () => {
    dataSource.query.mockResolvedValue([{ client_id: 2 }]);

    await service.resetPassword('t'.repeat(40), 'nouveaumotdepasse');

    expect(clientRepo.update).toHaveBeenCalledWith({ id: 2 }, expect.objectContaining({ password_hash: expect.any(String), email_verified_at: expect.any(Date) }));
    expect(tokenRepo.delete).toHaveBeenCalledWith({ client_id: 2, type: 'reset_password' });
  });

  describe('deleteOwnAccount', () => {
    it('requires the right password', async () => {
      clientRepo.findOne.mockResolvedValue({ id: 1, name: 'J', email: 'j@e.com', password_hash: bcrypt.hashSync('motdepasse123', 4) });
      await expect(service.deleteOwnAccount(1, 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('anonymizes reservations, scrubs promo codes, deletes the client and confirms by email', async () => {
      clientRepo.findOne.mockResolvedValue({ id: 1, name: 'J', email: 'j@e.com', password_hash: bcrypt.hashSync('motdepasse123', 4) });

      await service.deleteOwnAccount(1, 'motdepasse123');

      const sql = manager.query.mock.calls.map((c) => c[0] as string).join('\n');
      expect(sql).toContain('UPDATE reservations');
      expect(sql).toContain("client_email = ''");
      expect(sql).toContain('UPDATE promotions');
      expect(sql).toContain('DELETE FROM clients');
      // Invoices are legally retained — never touched.
      expect(sql).not.toContain('invoices');
      expect(mail.sendAccountDeleted).toHaveBeenCalled();
    });
  });

  it('exports the profile, reservations, points and codes', async () => {
    clientRepo.findOne.mockResolvedValue({ id: 1, name: 'J', email: 'j@e.com', phone: '', birthdate: null, referral_code: 'ABC234' });
    dataSource.query.mockResolvedValue([]);

    const data = await service.exportData(1);

    expect(Object.keys(data)).toEqual(expect.arrayContaining(['profile', 'reservations', 'loyaltyPoints', 'promotionCodes']));
    expect(data.profile).not.toHaveProperty('password_hash');
  });

  it('warns inactive accounts once and records it', async () => {
    dataSource.query.mockResolvedValue([{ id: 5, name: 'Old', email: 'old@e.com' }]);
    await service.warnInactiveAccounts();
    expect(mail.sendInactivityWarning).toHaveBeenCalledWith(expect.objectContaining({ clientEmail: 'old@e.com' }));
    expect(clientRepo.update).toHaveBeenCalledWith({ id: 5 }, expect.objectContaining({ purge_warned_at: expect.any(Date) }));
  });

  it('erases accounts past the inactivity limit', async () => {
    dataSource.query.mockResolvedValue([{ id: 8 }]);
    await service.purgeInactiveAccounts();
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.query.mock.calls.some((c) => (c[0] as string).includes('DELETE FROM clients'))).toBe(true);
  });
});
