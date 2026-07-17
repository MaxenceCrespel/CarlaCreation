import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { Reservation } from '../../database/entities/reservation.entity';
import { Service } from '../../database/entities/service.entity';
import { MailService } from '../mail/mail.service';

describe('ReservationsService', () => {
  let service: ReservationsService;
  let dataSource: { transaction: jest.Mock };
  let reservationRepo: { createQueryBuilder: jest.Mock; update: jest.Mock; delete: jest.Mock };
  let serviceRepo: { findOne: jest.Mock };
  let mailService: { sendBookingReceived: jest.Mock; sendStatusUpdate: jest.Mock };

  const HAIRCUT = { id: 1, name: 'Coupe Femme', duration_minutes: 45, active: true };
  const MANICURE = { id: 7, name: 'Manucure Classique', duration_minutes: 30, active: true };

  beforeEach(async () => {
    dataSource = {
      transaction: jest.fn(async (fn) => {
        let nextId = 100;
        const manager = {
          insert: jest.fn(async () => ({ identifiers: [{ id: nextId++ }] })),
        };
        return fn(manager);
      }),
    };
    reservationRepo = {
      createQueryBuilder: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    serviceRepo = { findOne: jest.fn() };
    mailService = { sendBookingReceived: jest.fn(), sendStatusUpdate: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: getRepositoryToken(Reservation), useValue: reservationRepo },
        { provide: getRepositoryToken(Service), useValue: serviceRepo },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    service = module.get(ReservationsService);
  });

  function noOverlap() {
    reservationRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    });
  }

  it('createManual rejects an unknown service', async () => {
    serviceRepo.findOne.mockResolvedValue(null);

    await expect(
      service.createManual({
        serviceId: 999,
        clientName: 'Test',
        clientEmail: 'test@example.com',
        clientPhone: '0600000000',
        date: '2099-01-01',
        startTime: '10:00',
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('createManual detects a time overlap with an existing reservation', async () => {
    serviceRepo.findOne.mockResolvedValue(HAIRCUT);
    reservationRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ start_time: '10:15', end_time: '11:00' }]),
    });

    await expect(
      service.createManual({
        serviceId: 1,
        clientName: 'Test',
        clientEmail: 'test@example.com',
        clientPhone: '0600000000',
        date: '2099-01-01',
        startTime: '10:00',
        status: 'confirmed',
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('createManual books consecutive guests back-to-back, in order', async () => {
    serviceRepo.findOne.mockImplementation(({ where }: { where: { id: number } }) =>
      Promise.resolve(where.id === 1 ? HAIRCUT : MANICURE),
    );
    noOverlap();

    const result = await service.createManual({
      serviceId: 1,
      clientName: 'Mother',
      clientEmail: 'mother@example.com',
      clientPhone: '0600000000',
      date: '2099-01-01',
      startTime: '10:00',
      status: 'confirmed',
      additionalGuests: [{ name: 'Daughter', serviceId: 7 }],
    } as any);

    expect(result.guests).toHaveLength(2);
    expect(result.guests[0]).toMatchObject({ name: 'Mother', startTime: '10:00', endTime: '10:45' });
    expect(result.guests[1]).toMatchObject({ name: 'Daughter', startTime: '10:45', endTime: '11:15' });
    expect(result.endTime).toBe('11:15');
    expect(mailService.sendStatusUpdate).toHaveBeenCalled();
  });

  it('remove throws NotFoundException when nothing was deleted', async () => {
    reservationRepo.delete.mockResolvedValue({ affected: 0 });
    await expect(service.remove(999)).rejects.toBeInstanceOf(NotFoundException);
  });
});
