import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ContactService } from './contact.service';
import { ContactMessage } from '../../database/entities/contact-message.entity';
import { PushService } from '../push/push.service';

describe('ContactService', () => {
  let service: ContactService;
  let repo: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock; delete: jest.Mock };
  let pushService: { notifyAdmins: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve(v)),
      find: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
    };
    pushService = { notifyAdmins: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactService,
        { provide: getRepositoryToken(ContactMessage), useValue: repo },
        { provide: PushService, useValue: pushService },
      ],
    }).compile();

    service = module.get(ContactService);
  });

  it('creates and saves a contact message with the submitted fields', async () => {
    await service.create({ name: 'Camille', phone: '0601020304', message: 'Bonjour !' } as any);

    expect(repo.create).toHaveBeenCalledWith({ name: 'Camille', phone: '0601020304', message: 'Bonjour !' });
    expect(repo.save).toHaveBeenCalled();
  });

  it('notifies admins of the new contact message', async () => {
    await service.create({ name: 'Camille', phone: '0601020304', message: 'Bonjour !' } as any);

    expect(pushService.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Nouveau message de contact' }),
    );
  });

  it('returns all messages ordered by most recent first', async () => {
    repo.find.mockResolvedValue([
      { id: 2, name: 'B', message: 'Bonjour' },
      { id: 1, name: 'A', message: 'Salut' },
    ]);

    const result = await service.findAll();

    expect(repo.find).toHaveBeenCalledWith({ order: { created_at: 'DESC' } });
    expect(result.map((m) => m.id)).toEqual([2, 1]);
  });

  it('flags messages containing a web address as suspicious', async () => {
    repo.find.mockResolvedValue([
      { id: 2, name: 'Alexis', message: 'Voir https://gopartage.online/fr/spo/carlacreation' },
      { id: 1, name: 'Camille', message: 'Bonjour, un balayage samedi ?' },
    ]);

    const result = await service.findAll();

    expect(result.map((m) => m.suspicious)).toEqual([true, false]);
  });

  it('marks a message as read', async () => {
    const message = { id: 1, is_read: false };
    repo.findOne.mockResolvedValue(message);

    const result = await service.setRead(1, true);

    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(repo.save).toHaveBeenCalledWith({ id: 1, is_read: true });
    expect(result).toEqual({ id: 1, is_read: true });
  });

  it('throws when marking a non-existent message as read', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(service.setRead(999, true)).rejects.toThrow(NotFoundException);
  });

  it('deletes a message', async () => {
    repo.delete.mockResolvedValue({ affected: 1 });

    await service.remove(1);

    expect(repo.delete).toHaveBeenCalledWith(1);
  });

  it('throws when deleting a non-existent message', async () => {
    repo.delete.mockResolvedValue({ affected: 0 });

    await expect(service.remove(999)).rejects.toThrow(NotFoundException);
  });
});
