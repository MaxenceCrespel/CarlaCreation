import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ContactService } from './contact.service';
import { ContactMessage } from '../../database/entities/contact-message.entity';

describe('ContactService', () => {
  let service: ContactService;
  let repo: { create: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    repo = { create: jest.fn((v) => v), save: jest.fn((v) => Promise.resolve(v)) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ContactService, { provide: getRepositoryToken(ContactMessage), useValue: repo }],
    }).compile();

    service = module.get(ContactService);
  });

  it('creates and saves a contact message with the submitted fields', async () => {
    await service.create({ name: 'Camille', email: 'camille@example.com', message: 'Bonjour !' } as any);

    expect(repo.create).toHaveBeenCalledWith({ name: 'Camille', email: 'camille@example.com', message: 'Bonjour !' });
    expect(repo.save).toHaveBeenCalled();
  });
});
