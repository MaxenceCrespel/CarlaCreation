import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ContactService } from './contact.service';
import { ContactMessage } from '../../database/entities/contact-message.entity';
import { PushService } from '../push/push.service';

describe('ContactService', () => {
  let service: ContactService;
  let repo: { create: jest.Mock; save: jest.Mock };
  let pushService: { notifyAdmins: jest.Mock };

  beforeEach(async () => {
    repo = { create: jest.fn((v) => v), save: jest.fn((v) => Promise.resolve(v)) };
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
    await service.create({ name: 'Camille', email: 'camille@example.com', message: 'Bonjour !' } as any);

    expect(repo.create).toHaveBeenCalledWith({ name: 'Camille', email: 'camille@example.com', message: 'Bonjour !' });
    expect(repo.save).toHaveBeenCalled();
  });

  it('notifies admins of the new contact message', async () => {
    await service.create({ name: 'Camille', email: 'camille@example.com', message: 'Bonjour !' } as any);

    expect(pushService.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Nouveau message de contact' }),
    );
  });
});
