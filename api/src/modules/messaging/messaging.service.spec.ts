import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { Client } from '../../database/entities/client.entity';
import { ClientMessage } from '../../database/entities/client-message.entity';
import { MailService } from '../mail/mail.service';
import { PushService } from '../push/push.service';
import { MessagingService } from './messaging.service';

describe('MessagingService', () => {
  let service: MessagingService;
  let messageRepo: { create: jest.Mock; save: jest.Mock; update: jest.Mock; count: jest.Mock; findOne: jest.Mock; delete: jest.Mock };
  let clientRepo: { findOne: jest.Mock };
  let dataSource: { query: jest.Mock };
  let push: { notifyAdmins: jest.Mock };
  let mail: { sendClientNewMessage: jest.Mock; sendAdminNewClientMessage: jest.Mock };

  const savedRow = (over: Partial<Record<string, unknown>> = {}) => ({
    id: 10,
    sender: 'client',
    body: 'Bonjour',
    has_photo: false,
    read_at: null,
    created_at: new Date(),
    reservation_id: null,
    reservation_date: null,
    start_time: null,
    service_name: null,
    ...over,
  });

  beforeEach(async () => {
    messageRepo = {
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => ({ id: 10, ...v })),
      update: jest.fn(),
      count: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
    };
    clientRepo = { findOne: jest.fn() };
    dataSource = { query: jest.fn() };
    push = { notifyAdmins: jest.fn() };
    mail = { sendClientNewMessage: jest.fn(), sendAdminNewClientMessage: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        MessagingService,
        { provide: getRepositoryToken(ClientMessage), useValue: messageRepo },
        { provide: getRepositoryToken(Client), useValue: clientRepo },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: PushService, useValue: push },
        { provide: MailService, useValue: mail },
      ],
    }).compile();
    service = module.get(MessagingService);
  });

  it('refuses an empty message (no text, no photo)', async () => {
    clientRepo.findOne.mockResolvedValue({ id: 1, name: 'Léa' });
    await expect(service.sendFromClient(1, '   ', null)).rejects.toBeInstanceOf(BadRequestException);
    expect(messageRepo.save).not.toHaveBeenCalled();
  });

  it('client message: saved, then Carla is notified (push + email) for the first message of a burst', async () => {
    clientRepo.findOne.mockResolvedValue({ id: 1, name: 'Léa Martin' });
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('id <> $3')) return []; // no previous message → notify
      return [savedRow()];
    });

    const result = await service.sendFromClient(1, '  Bonjour  ', null);

    expect(messageRepo.save).toHaveBeenCalledWith(expect.objectContaining({ client_id: 1, sender: 'client', body: 'Bonjour', photo: null }));
    expect(push.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ title: 'Message de Léa Martin', url: '/admin#/plus/messages/1' }));
    expect(mail.sendAdminNewClientMessage).toHaveBeenCalled();
    expect(result).toMatchObject({ id: 10, sender: 'client', body: 'Bonjour', hasPhoto: false });
  });

  it('does not notify again while the previous message is unread and recent', async () => {
    clientRepo.findOne.mockResolvedValue({ id: 1, name: 'Léa' });
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('id <> $3')) return [{ read_at: null, created_at: new Date(Date.now() - 5 * 60 * 1000) }];
      return [savedRow()];
    });

    await service.sendFromClient(1, 'Encore moi', null);

    expect(push.notifyAdmins).not.toHaveBeenCalled();
    expect(mail.sendAdminNewClientMessage).not.toHaveBeenCalled();
  });

  it('ignores a reservation that does not belong to the client', async () => {
    clientRepo.findOne.mockResolvedValue({ id: 1, name: 'Léa' });
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM reservations WHERE id')) return []; // not hers
      if (sql.includes('id <> $3')) return [];
      return [savedRow()];
    });

    await service.sendFromClient(1, 'Question', null, 99);

    expect(messageRepo.save).toHaveBeenCalledWith(expect.objectContaining({ reservation_id: null }));
  });

  it('admin cannot write to a fiche without an online account', async () => {
    clientRepo.findOne.mockResolvedValue({ id: 2, name: 'Sans compte', password_hash: null, email: '' });
    await expect(service.sendFromAdmin(2, 'Bonjour', null)).rejects.toBeInstanceOf(BadRequestException);
    expect(messageRepo.save).not.toHaveBeenCalled();
  });

  it('admin message emails the client', async () => {
    clientRepo.findOne.mockResolvedValue({ id: 1, name: 'Léa Martin', first_name: 'Léa', password_hash: 'x', email: 'lea@exemple.fr' });
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('id <> $3')) return [{ read_at: new Date(), created_at: new Date() }]; // previous one read → notify
      return [savedRow({ sender: 'admin', body: 'Avec plaisir' })];
    });

    await service.sendFromAdmin(1, 'Avec plaisir', null);

    expect(mail.sendClientNewMessage).toHaveBeenCalledWith({ clientName: 'Léa', clientEmail: 'lea@exemple.fr', preview: 'Avec plaisir' });
  });

  it('a client cannot open a photo from another conversation', async () => {
    messageRepo.findOne.mockResolvedValue({ id: 5, client_id: 2, photo: 'x.jpg' });
    await expect(service.photoPath(5, 1)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.photoPath(5)).resolves.toMatch(/messages[\\/]x\.jpg$/);
  });

  it('marks as read only what the other side sent', async () => {
    await service.markRead(1, 'client');
    expect(messageRepo.update).toHaveBeenCalledWith(expect.objectContaining({ client_id: 1, sender: 'admin' }), expect.any(Object));
    await service.markRead(1, 'admin');
    expect(messageRepo.update).toHaveBeenLastCalledWith(expect.objectContaining({ client_id: 1, sender: 'client' }), expect.any(Object));
  });
});
