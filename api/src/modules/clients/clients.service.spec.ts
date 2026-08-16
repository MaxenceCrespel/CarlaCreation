import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { Client } from '../../database/entities/client.entity';
import { Reservation } from '../../database/entities/reservation.entity';

describe('ClientsService', () => {
  let service: ClientsService;
  let clientRepo: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock; delete: jest.Mock };
  let reservationRepo: { findOne: jest.Mock; update: jest.Mock };
  let dataSource: { query: jest.Mock };

  beforeEach(async () => {
    clientRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve({ id: 1, ...v })),
      delete: jest.fn(),
    };
    reservationRepo = { findOne: jest.fn(), update: jest.fn() };
    dataSource = { query: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        { provide: getRepositoryToken(Client), useValue: clientRepo },
        { provide: getRepositoryToken(Reservation), useValue: reservationRepo },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = module.get(ClientsService);
  });

  it('matchCandidates normalizes the name (case/whitespace-insensitive) before matching', async () => {
    clientRepo.find.mockResolvedValue([{ id: 1, name: 'Maxence Crespel', normalized_name: 'maxence crespel' }]);
    dataSource.query.mockResolvedValue([]);

    await service.matchCandidates('  MaXencE   cReSpEl ');

    expect(clientRepo.find).toHaveBeenCalledWith({ where: { normalized_name: 'maxence crespel' } });
  });

  it('matchCandidates returns an empty array for a blank name without querying', async () => {
    const result = await service.matchCandidates('   ');
    expect(result).toEqual([]);
    expect(clientRepo.find).not.toHaveBeenCalled();
  });

  it('matchCandidates attaches each candidate its own reservation history', async () => {
    clientRepo.find.mockResolvedValue([
      { id: 1, name: 'Maxence Crespel', normalized_name: 'maxence crespel' },
      { id: 2, name: 'Maxence Crespel', normalized_name: 'maxence crespel' },
    ]);
    dataSource.query.mockResolvedValue([
      { id: 10, client_id: 1, reservation_date: '2026-08-01', start_time: '10:00', status: 'completed', service_name: 'Coupe Femme' },
      { id: 11, client_id: 2, reservation_date: '2026-08-05', start_time: '11:00', status: 'confirmed', service_name: 'Coloration' },
    ]);

    const result = await service.matchCandidates('Maxence Crespel');

    expect(result).toHaveLength(2);
    expect(result[0].history).toEqual([
      { id: 10, client_id: 1, reservation_date: '2026-08-01', start_time: '10:00', status: 'completed', service_name: 'Coupe Femme' },
    ]);
    expect(result[1].history).toEqual([
      { id: 11, client_id: 2, reservation_date: '2026-08-05', start_time: '11:00', status: 'confirmed', service_name: 'Coloration' },
    ]);
  });

  it('create normalizes the name and trims text fields', async () => {
    const result = await service.create({ name: '  Maxence Crespel  ', phone: ' 0600000000 ', notes: ' allergie ' } as any);
    expect(result).toMatchObject({ name: 'Maxence Crespel', normalized_name: 'maxence crespel', phone: '0600000000', notes: 'allergie' });
  });

  it('createAndLink throws NotFoundException for a missing reservation', async () => {
    reservationRepo.findOne.mockResolvedValue(null);
    await expect(service.createAndLink({ reservationId: 999, name: 'Test' } as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('createAndLink creates the client then links the reservation to it', async () => {
    reservationRepo.findOne.mockResolvedValue({ id: 5 });
    const client = await service.createAndLink({ reservationId: 5, name: 'Julie Martin' } as any);
    expect(reservationRepo.update).toHaveBeenCalledWith({ id: 5 }, { client_id: client.id });
  });

  it('link throws NotFoundException for a missing client', async () => {
    clientRepo.findOne.mockResolvedValue(null);
    await expect(service.link(1, 999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('link throws NotFoundException for a missing reservation', async () => {
    clientRepo.findOne.mockResolvedValue({ id: 1 });
    reservationRepo.update.mockResolvedValue({ affected: 0 });
    await expect(service.link(999, 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('link sets client_id on the reservation', async () => {
    clientRepo.findOne.mockResolvedValue({ id: 1 });
    reservationRepo.update.mockResolvedValue({ affected: 1 });
    await service.link(5, 1);
    expect(reservationRepo.update).toHaveBeenCalledWith({ id: 5 }, { client_id: 1 });
  });

  it('unlink clears client_id on the reservation', async () => {
    reservationRepo.update.mockResolvedValue({ affected: 1 });
    await service.unlink(5);
    expect(reservationRepo.update).toHaveBeenCalledWith({ id: 5 }, { client_id: null });
  });

  it('unlink throws NotFoundException for a missing reservation', async () => {
    reservationRepo.update.mockResolvedValue({ affected: 0 });
    await expect(service.unlink(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update re-normalizes the name when it changes', async () => {
    clientRepo.findOne.mockResolvedValue({ id: 1, name: 'Old Name', normalized_name: 'old name', phone: '', email: '', notes: '' });
    await service.update(1, { name: 'New Name' } as any);
    expect(clientRepo.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Name', normalized_name: 'new name' }));
  });

  it('update throws NotFoundException for a missing client', async () => {
    clientRepo.findOne.mockResolvedValue(null);
    await expect(service.update(999, { notes: 'x' } as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove throws NotFoundException when nothing was deleted', async () => {
    clientRepo.delete.mockResolvedValue({ affected: 0 });
    await expect(service.remove(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove succeeds silently when a row was deleted', async () => {
    clientRepo.delete.mockResolvedValue({ affected: 1 });
    await expect(service.remove(1)).resolves.toBeUndefined();
  });
});
