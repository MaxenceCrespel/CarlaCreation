import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { Reservation } from '../../database/entities/reservation.entity';
import { Service } from '../../database/entities/service.entity';
import { MailService } from '../mail/mail.service';

describe('ReservationsService', () => {
  let service: ReservationsService;
  let dataSource: { transaction: jest.Mock; query: jest.Mock };
  let reservationRepo: { createQueryBuilder: jest.Mock; update: jest.Mock; delete: jest.Mock };
  let serviceRepo: { findOne: jest.Mock };
  let mailService: {
    sendBookingReceived: jest.Mock;
    sendStatusUpdate: jest.Mock;
    sendAdminNewBookingNotification: jest.Mock;
    sendReminder: jest.Mock;
  };

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
      query: jest.fn(),
    };
    reservationRepo = {
      createQueryBuilder: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    serviceRepo = { findOne: jest.fn() };
    mailService = {
      sendBookingReceived: jest.fn(),
      sendStatusUpdate: jest.fn(),
      sendAdminNewBookingNotification: jest.fn(),
      sendReminder: jest.fn(),
    };

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

  it('findByGroupId returns the booking group, mapped by guest', async () => {
    dataSource.query.mockResolvedValue([
      {
        client_name: 'Mother',
        client_email: 'mother@example.com',
        reservation_date: '2099-01-01',
        start_time: '10:00',
        end_time: '10:45',
        status: 'confirmed',
        service_name: 'Coupe Femme',
      },
    ]);

    const result = await service.findByGroupId('11111111-1111-1111-1111-111111111111');

    expect(result.status).toBe('confirmed');
    expect(result.guests).toHaveLength(1);
    expect(result.guests[0]).toMatchObject({ name: 'Mother', serviceName: 'Coupe Femme' });
  });

  it('findByGroupId throws NotFoundException for an unknown group', async () => {
    dataSource.query.mockResolvedValue([]);
    await expect(service.findByGroupId('unknown')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cancelByGroupId throws NotFoundException for an unknown group', async () => {
    dataSource.query.mockResolvedValue([]);
    await expect(service.cancelByGroupId('unknown')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cancelByGroupId refuses to re-cancel an already cancelled group', async () => {
    dataSource.query.mockResolvedValue([{ status: 'cancelled' }]);
    await expect(service.cancelByGroupId('some-group')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cancelByGroupId refuses to cancel a completed booking', async () => {
    dataSource.query.mockResolvedValue([{ status: 'completed' }]);
    await expect(service.cancelByGroupId('some-group')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cancelByGroupId cancels a pending booking and notifies the client', async () => {
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT status')) return [{ status: 'pending' }];
      return [
        {
          client_name: 'Mother',
          client_email: 'mother@example.com',
          reservation_date: '2099-01-01',
          start_time: '10:00',
          end_time: '10:45',
          service_name: 'Coupe Femme',
        },
      ];
    });
    reservationRepo.update.mockResolvedValue({ affected: 1 });

    await service.cancelByGroupId('some-group');

    expect(reservationRepo.update).toHaveBeenCalledWith({ group_id: 'some-group' }, { status: 'cancelled' });
    expect(mailService.sendStatusUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
  });

  describe('dispatchDueReminders', () => {
    function partsInHours(hoursFromNow: number): { date: string; time: string } {
      const at = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
      const date = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
      const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
      return { date, time };
    }

    it('sends a reminder for a confirmed booking within the next 24h and marks it sent', async () => {
      const { date, time } = partsInHours(20);
      reservationRepo.update.mockResolvedValue({ affected: 1 });
      dataSource.query.mockResolvedValue([
        {
          id: 1,
          group_id: null,
          client_name: 'Alice',
          client_email: 'alice@example.com',
          reservation_date: date,
          start_time: time,
          end_time: time,
          service_name: 'Coupe Femme',
        },
      ]);

      await service.dispatchDueReminders();

      expect(mailService.sendReminder).toHaveBeenCalledWith(
        expect.objectContaining({ clientEmail: 'alice@example.com' }),
      );
      expect(reservationRepo.update).toHaveBeenCalledWith([1], { reminder_sent: true });
    });

    it('does not remind a booking more than 24h away', async () => {
      const { date, time } = partsInHours(48);
      dataSource.query.mockResolvedValue([
        {
          id: 2,
          group_id: null,
          client_name: 'Bob',
          client_email: 'bob@example.com',
          reservation_date: date,
          start_time: time,
          end_time: time,
          service_name: 'Coupe Homme',
        },
      ]);

      await service.dispatchDueReminders();

      expect(mailService.sendReminder).not.toHaveBeenCalled();
      expect(reservationRepo.update).not.toHaveBeenCalled();
    });

    it('does not remind a booking that has already passed', async () => {
      const { date, time } = partsInHours(-2);
      dataSource.query.mockResolvedValue([
        {
          id: 3,
          group_id: null,
          client_name: 'Carl',
          client_email: 'carl@example.com',
          reservation_date: date,
          start_time: time,
          end_time: time,
          service_name: 'Coupe Homme',
        },
      ]);

      await service.dispatchDueReminders();

      expect(mailService.sendReminder).not.toHaveBeenCalled();
    });

    it('sends a single combined reminder per group instead of one per guest', async () => {
      const { date, time } = partsInHours(10);
      reservationRepo.update.mockResolvedValue({ affected: 2 });
      dataSource.query.mockResolvedValue([
        {
          id: 10,
          group_id: 'group-a',
          client_name: 'Mother',
          client_email: 'mother@example.com',
          reservation_date: date,
          start_time: time,
          end_time: time,
          service_name: 'Coupe Femme',
        },
        {
          id: 11,
          group_id: 'group-a',
          client_name: 'Daughter',
          client_email: 'mother@example.com',
          reservation_date: date,
          start_time: time,
          end_time: time,
          service_name: 'Manucure Classique',
        },
      ]);

      await service.dispatchDueReminders();

      expect(mailService.sendReminder).toHaveBeenCalledTimes(1);
      expect(mailService.sendReminder).toHaveBeenCalledWith(expect.objectContaining({ guests: expect.arrayContaining([
        expect.objectContaining({ name: 'Mother' }),
        expect.objectContaining({ name: 'Daughter' }),
      ]) }));
      expect(reservationRepo.update).toHaveBeenCalledWith([10, 11], { reminder_sent: true });
    });
  });
});
