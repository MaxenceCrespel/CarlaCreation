import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { Reservation } from '../../database/entities/reservation.entity';
import { Service } from '../../database/entities/service.entity';
import { ServiceAddon } from '../../database/entities/service-addon.entity';
import { MailService } from '../mail/mail.service';
import { SettingsService } from '../settings/settings.service';
import { DistanceService } from '../distance/distance.service';
import { PushService } from '../push/push.service';
import { PromotionsService } from '../promotions/promotions.service';

describe('ReservationsService', () => {
  let service: ReservationsService;
  let dataSource: { transaction: jest.Mock; query: jest.Mock };
  let reservationRepo: { createQueryBuilder: jest.Mock; findOne: jest.Mock; update: jest.Mock; delete: jest.Mock };
  let serviceRepo: { findOne: jest.Mock };
  let addonRepo: { find: jest.Mock };
  let mailService: {
    sendBookingReceived: jest.Mock;
    sendStatusUpdate: jest.Mock;
    sendAdminNewBookingNotification: jest.Mock;
    sendAdminCancellationNotification: jest.Mock;
    sendReminder: jest.Mock;
  };
  let settingsService: { getTravelBufferMinutes: jest.Mock; getTravelFeeFallbackCents: jest.Mock; getTravelFeeTiers: jest.Mock };
  let distanceService: { estimate: jest.Mock };
  let pushService: { notifyAdmins: jest.Mock };
  let promotionsService: { findSelectable: jest.Mock; findByCode: jest.Mock; findAll: jest.Mock };

  const HAIRCUT = { id: 1, name: 'Coupe Femme', duration_minutes: 45, active: true };
  const MANICURE = { id: 7, name: 'Manucure Classique', duration_minutes: 30, active: true };

  beforeEach(async () => {
    dataSource = {
      transaction: jest.fn(async (fn) => {
        let nextId = 100;
        const manager = {
          insert: jest.fn(async () => ({ identifiers: [{ id: nextId++ }] })),
          update: jest.fn(),
          delete: jest.fn(),
        };
        return fn(manager);
      }),
      query: jest.fn(),
    };
    reservationRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    serviceRepo = { findOne: jest.fn() };
    addonRepo = { find: jest.fn().mockResolvedValue([]) };
    mailService = {
      sendBookingReceived: jest.fn(),
      sendStatusUpdate: jest.fn(),
      sendAdminNewBookingNotification: jest.fn(),
      sendAdminCancellationNotification: jest.fn(),
      sendReminder: jest.fn(),
    };
    // 30 minutes, matching the app_settings default — kept in sync with the
    // "travelBufferMinutes is 30" assumption in the tests below.
    settingsService = {
      getTravelBufferMinutes: jest.fn().mockResolvedValue(30),
      getTravelFeeFallbackCents: jest.fn().mockResolvedValue(200),
      getTravelFeeTiers: jest.fn().mockResolvedValue([
        { minKm: 0, feeCents: 0 },
        { minKm: 10, feeCents: 200 },
      ]),
    };
    // No address geocoded by default — most tests don't care about travel
    // distance, so this keeps them on the "flat fallback fee only" path.
    distanceService = { estimate: jest.fn().mockResolvedValue(null) };
    pushService = { notifyAdmins: jest.fn() };
    // No promotion applied by default — tests that care about discounts
    // set up their own findSelectable/findByCode/findAll return values.
    promotionsService = {
      findSelectable: jest.fn().mockResolvedValue([]),
      findByCode: jest.fn().mockRejectedValue(new NotFoundException('Code promo invalide ou expiré.')),
      findAll: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: getRepositoryToken(Reservation), useValue: reservationRepo },
        { provide: getRepositoryToken(Service), useValue: serviceRepo },
        { provide: getRepositoryToken(ServiceAddon), useValue: addonRepo },
        { provide: MailService, useValue: mailService },
        { provide: SettingsService, useValue: settingsService },
        { provide: DistanceService, useValue: distanceService },
        { provide: PushService, useValue: pushService },
        { provide: PromotionsService, useValue: promotionsService },
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

  it('createManual allows a genuinely overlapping slot when allowOverlap is set', async () => {
    serviceRepo.findOne.mockResolvedValue(HAIRCUT);
    // No createQueryBuilder call expected at all — allowOverlap skips the
    // overlap check (and thus the "existing" lookup) entirely.
    reservationRepo.createQueryBuilder.mockImplementation(() => {
      throw new Error('should not query for overlaps when allowOverlap is true');
    });
    dataSource.transaction.mockImplementationOnce(async (fn) => {
      const manager = { insert: jest.fn(async () => ({ identifiers: [{ id: 300 }] })) };
      return fn(manager);
    });

    await expect(
      service.createManual({
        serviceId: 1,
        clientName: 'Coupe pendant la pose',
        clientEmail: 'test@example.com',
        clientPhone: '0600000000',
        date: '2099-01-01',
        startTime: '10:30',
        status: 'confirmed',
        allowOverlap: true,
      } as any),
    ).resolves.toMatchObject({ startTime: '10:30' });
  });

  it('createManual rejects a slot that only overlaps the travel buffer of an existing home visit', async () => {
    // travelBufferMinutes is 30 — an existing 10:15–11:00 à-domicile visit
    // busies 09:45–11:30, so a studio booking starting at 11:00 collides.
    serviceRepo.findOne.mockResolvedValue(HAIRCUT);
    reservationRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ start_time: '10:15', end_time: '11:00', at_client_home: true }]),
    });

    await expect(
      service.createManual({
        serviceId: 1,
        clientName: 'Test',
        clientEmail: 'test@example.com',
        clientPhone: '0600000000',
        date: '2099-01-01',
        startTime: '11:00',
        status: 'confirmed',
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("createManual sizes the new booking's own travel buffer from its real distance, not the flat default", async () => {
    // Existing 09:00–09:30 à-domicile visit has no persisted travel
    // duration, so it falls back to the flat 30-min default: busy
    // 08:30–10:00. The NEW à-domicile booking at 10:05 (15 min, ends
    // 10:20) only avoids that if ITS OWN buffer is its real 5-minute
    // travel time (candidate 10:00–10:25) rather than the flat 30 min
    // (which would expand it to 09:35–10:50 and collide).
    serviceRepo.findOne.mockResolvedValue(HAIRCUT);
    distanceService.estimate.mockResolvedValue({ distanceKm: 2, durationMinutes: 5 });
    reservationRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ start_time: '09:00', end_time: '09:30', at_client_home: true, travel_duration_minutes: null }]),
    });
    dataSource.transaction.mockImplementationOnce(async (fn) => {
      const manager = { insert: jest.fn(async () => ({ identifiers: [{ id: 400 }] })) };
      return fn(manager);
    });

    await expect(
      service.createManual({
        serviceId: 1,
        clientName: 'Test',
        clientEmail: 'test@example.com',
        clientPhone: '0600000000',
        date: '2099-01-01',
        startTime: '10:05',
        status: 'confirmed',
        atClientHome: true,
        clientAddress: 'Nearby address',
      } as any),
    ).resolves.toMatchObject({ startTime: '10:05' });
  });

  it('createManual stores atClientHome and clientAddress on every guest row', async () => {
    serviceRepo.findOne.mockResolvedValue(HAIRCUT);
    noOverlap();

    const insertCalls: Record<string, unknown>[] = [];
    dataSource.transaction.mockImplementationOnce(async (fn) => {
      const manager = {
        insert: jest.fn(async (_entity: unknown, payload: Record<string, unknown>) => {
          insertCalls.push(payload);
          return { identifiers: [{ id: 100 + insertCalls.length }] };
        }),
      };
      return fn(manager);
    });

    await service.createManual({
      serviceId: 1,
      clientName: 'Test',
      clientEmail: 'test@example.com',
      clientPhone: '0600000000',
      date: '2099-01-01',
      startTime: '10:00',
      status: 'confirmed',
      atClientHome: true,
      clientAddress: '12 rue du Test, 59000 Lille',
    } as any);

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toMatchObject({ at_client_home: true, client_address: '12 rue du Test, 59000 Lille' });
  });

  it('createManual persists only the flat base fee when the address cannot be geocoded', async () => {
    serviceRepo.findOne.mockResolvedValue(HAIRCUT);
    noOverlap();
    distanceService.estimate.mockResolvedValue(null);

    const insertCalls: Record<string, unknown>[] = [];
    dataSource.transaction.mockImplementationOnce(async (fn) => {
      const manager = { insert: jest.fn(async (_entity: unknown, payload: Record<string, unknown>) => (insertCalls.push(payload), { identifiers: [{ id: 200 }] })) };
      return fn(manager);
    });

    await service.createManual({
      serviceId: 1,
      clientName: 'Test',
      clientEmail: 'test@example.com',
      clientPhone: '0600000000',
      date: '2099-01-01',
      startTime: '10:00',
      status: 'confirmed',
      atClientHome: true,
      clientAddress: 'Somewhere unresolvable',
    } as any);

    expect(insertCalls[0]).toMatchObject({ travel_fee_cents: 200, travel_distance_km: null, travel_duration_minutes: null });
  });

  it('createManual is free within the configured radius when the address geocodes successfully', async () => {
    serviceRepo.findOne.mockResolvedValue(HAIRCUT);
    noOverlap();
    distanceService.estimate.mockResolvedValue({ distanceKm: 8.4, durationMinutes: 15 });

    const insertCalls: Record<string, unknown>[] = [];
    dataSource.transaction.mockImplementationOnce(async (fn) => {
      const manager = { insert: jest.fn(async (_entity: unknown, payload: Record<string, unknown>) => (insertCalls.push(payload), { identifiers: [{ id: 201 }] })) };
      return fn(manager);
    });

    await service.createManual({
      serviceId: 1,
      clientName: 'Test',
      clientEmail: 'test@example.com',
      clientPhone: '0600000000',
      date: '2099-01-01',
      startTime: '10:00',
      status: 'confirmed',
      atClientHome: true,
      clientAddress: '12 rue du Test, 59000 Lille',
    } as any);

    // 8.4km is under the 10km free-radius tier, so no fee — even though the
    // distance is now known and persisted.
    expect(insertCalls[0]).toMatchObject({ travel_fee_cents: 0, travel_distance_km: 8.4, travel_duration_minutes: 15 });
  });

  it('createManual applies the matching tier fee once past the free radius', async () => {
    serviceRepo.findOne.mockResolvedValue(HAIRCUT);
    noOverlap();
    distanceService.estimate.mockResolvedValue({ distanceKm: 15, durationMinutes: 30 });

    const insertCalls: Record<string, unknown>[] = [];
    dataSource.transaction.mockImplementationOnce(async (fn) => {
      const manager = { insert: jest.fn(async (_entity: unknown, payload: Record<string, unknown>) => (insertCalls.push(payload), { identifiers: [{ id: 203 }] })) };
      return fn(manager);
    });

    await service.createManual({
      serviceId: 1,
      clientName: 'Test',
      clientEmail: 'test@example.com',
      clientPhone: '0600000000',
      date: '2099-01-01',
      startTime: '10:00',
      status: 'confirmed',
      atClientHome: true,
      clientAddress: 'Somewhere further away',
    } as any);

    expect(insertCalls[0]).toMatchObject({ travel_fee_cents: 200, travel_distance_km: 15, travel_duration_minutes: 30 });
  });

  it('createManual leaves travel fields null for a studio (non à-domicile) booking', async () => {
    serviceRepo.findOne.mockResolvedValue(HAIRCUT);
    noOverlap();

    const insertCalls: Record<string, unknown>[] = [];
    dataSource.transaction.mockImplementationOnce(async (fn) => {
      const manager = { insert: jest.fn(async (_entity: unknown, payload: Record<string, unknown>) => (insertCalls.push(payload), { identifiers: [{ id: 202 }] })) };
      return fn(manager);
    });

    await service.createManual({
      serviceId: 1,
      clientName: 'Test',
      clientEmail: 'test@example.com',
      clientPhone: '0600000000',
      date: '2099-01-01',
      startTime: '10:00',
      status: 'confirmed',
    } as any);

    expect(distanceService.estimate).not.toHaveBeenCalled();
    expect(insertCalls[0]).toMatchObject({ travel_fee_cents: null, travel_distance_km: null, travel_duration_minutes: null });
  });

  describe('estimateTravel', () => {
    it('reports unavailable and the flat fallback fee when geocoding fails', async () => {
      distanceService.estimate.mockResolvedValue(null);
      await expect(service.estimateTravel('Somewhere unresolvable')).resolves.toEqual({
        available: false,
        feeCents: 200,
        distanceKm: null,
        durationMinutes: null,
      });
    });

    it('reports the matching tier fee when geocoding succeeds', async () => {
      distanceService.estimate.mockResolvedValue({ distanceKm: 10, durationMinutes: 30 });
      await expect(service.estimateTravel('12 rue du Test, 59000 Lille')).resolves.toEqual({
        available: true,
        feeCents: 200,
        distanceKm: 10,
        durationMinutes: 30,
      });
    });
  });

  describe('addons', () => {
    const NAIL_ART = { id: 50, service_id: 7, name: 'Nail Art', extra_price_cents: 1000, extra_duration_minutes: 15, active: true };

    it('extends the reservation duration and records a reservation_addons row for a valid addon', async () => {
      serviceRepo.findOne.mockResolvedValue(MANICURE);
      addonRepo.find.mockResolvedValue([NAIL_ART]);
      noOverlap();

      const inserts: { entity: unknown; payload: unknown }[] = [];
      dataSource.transaction.mockImplementationOnce(async (fn) => {
        const manager = {
          insert: jest.fn(async (entity: unknown, payload: unknown) => {
            inserts.push({ entity, payload });
            return { identifiers: [{ id: 200 }] };
          }),
        };
        return fn(manager);
      });

      const result = await service.createManual({
        serviceId: 7,
        clientName: 'Test',
        clientEmail: 'test@example.com',
        clientPhone: '0600000000',
        date: '2099-01-01',
        startTime: '10:00',
        status: 'confirmed',
        addonIds: [50],
      } as any);

      // 30 min (Manucure Classique) + 15 min (Nail Art) = 45 min
      expect(result.guests[0]).toMatchObject({ startTime: '10:00', endTime: '10:45' });
      expect(result.guests[0].serviceName).toBe('Manucure Classique + Nail Art');

      const addonInsert = inserts.find((i) => Array.isArray(i.payload));
      expect(addonInsert).toBeTruthy();
      expect((addonInsert!.payload as any[])[0]).toMatchObject({
        reservation_id: 200,
        name: 'Nail Art',
        extra_price_cents: 1000,
        extra_duration_minutes: 15,
      });
    });

    it('extends the duration correctly with TWO addons selected at once', async () => {
      const POLISH = { id: 51, service_id: 7, name: 'Pose Vernis', extra_price_cents: 500, extra_duration_minutes: 10, active: true };
      serviceRepo.findOne.mockResolvedValue(MANICURE);
      addonRepo.find.mockResolvedValue([NAIL_ART, POLISH]);
      noOverlap();

      dataSource.transaction.mockImplementationOnce(async (fn) => {
        const manager = { insert: jest.fn(async () => ({ identifiers: [{ id: 201 }] })) };
        return fn(manager);
      });

      const result = await service.createManual({
        serviceId: 7,
        clientName: 'Test',
        clientEmail: 'test@example.com',
        clientPhone: '0600000000',
        date: '2099-01-01',
        startTime: '10:00',
        status: 'confirmed',
        addonIds: [50, 51],
      } as any);

      // 30 min (Manucure Classique) + 15 min (Nail Art) + 10 min (Pose Vernis) = 55 min
      expect(result.guests[0]).toMatchObject({ startTime: '10:00', endTime: '10:55' });
    });

    it('findAllForAdmin attaches each reservation\'s addons alongside its service name', async () => {
      dataSource.query.mockImplementation((sql: string) => {
        if (sql.includes('JOIN services s')) {
          return Promise.resolve([
            { id: 1, service_name: 'Manucure Classique', addons: undefined },
            { id: 2, service_name: 'Coupe Femme', addons: undefined },
          ]);
        }
        if (sql.includes('FROM reservation_addons')) {
          return Promise.resolve([{ reservation_id: 1, name: 'Nail Art', extra_price_cents: 1000, extra_duration_minutes: 15 }]);
        }
        throw new Error(`Unexpected query: ${sql}`);
      });

      const rows = await service.findAllForAdmin();

      expect(rows.find((r) => r.id === 1)?.addons).toEqual([{ name: 'Nail Art', extra_price_cents: 1000, extra_duration_minutes: 15 }]);
      expect(rows.find((r) => r.id === 2)?.addons).toEqual([]);
    });

    it('rejects an addon id that does not exist', async () => {
      serviceRepo.findOne.mockResolvedValue(MANICURE);
      addonRepo.find.mockResolvedValue([]); // none found for the requested id

      await expect(
        service.createManual({
          serviceId: 7,
          clientName: 'Test',
          clientEmail: 'test@example.com',
          clientPhone: '0600000000',
          date: '2099-01-01',
          startTime: '10:00',
          addonIds: [999],
        } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an addon that belongs to a different service', async () => {
      serviceRepo.findOne.mockResolvedValue(HAIRCUT); // booking Coupe Femme (id 1)...
      addonRepo.find.mockResolvedValue([NAIL_ART]); // ...but Nail Art belongs to service 7

      await expect(
        service.createManual({
          serviceId: 1,
          clientName: 'Test',
          clientEmail: 'test@example.com',
          clientPhone: '0600000000',
          date: '2099-01-01',
          startTime: '10:00',
          addonIds: [50],
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an inactive addon on the public booking flow (create), which requires active addons', async () => {
      serviceRepo.findOne.mockResolvedValue(MANICURE);
      addonRepo.find.mockResolvedValue([{ ...NAIL_ART, active: false }]);

      await expect(
        service.create({
          serviceId: 7,
          clientName: 'Test',
          clientEmail: 'test@example.com',
          clientPhone: '0600000000',
          date: '2099-01-01',
          startTime: '10:00',
          addonIds: [50],
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
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
    dataSource.query.mockResolvedValue([]);
    reservationRepo.delete.mockResolvedValue({ affected: 0 });
    await expect(service.remove(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove notifies the client when deleting a pending reservation', async () => {
    dataSource.query.mockResolvedValue([
      {
        group_id: null,
        client_name: 'Alice',
        client_email: 'alice@example.com',
        reservation_date: '2099-01-01',
        start_time: '10:00',
        end_time: '10:45',
        status: 'pending',
        service_name: 'Coupe Femme',
        at_client_home: false,
        client_address: null,
      },
    ]);
    reservationRepo.delete.mockResolvedValue({ affected: 1 });

    await service.remove(1);

    expect(mailService.sendStatusUpdate).toHaveBeenCalledWith(expect.objectContaining({ clientEmail: 'alice@example.com', status: 'cancelled' }));
  });

  it('remove notifies the client when deleting a confirmed reservation', async () => {
    dataSource.query.mockResolvedValue([
      {
        group_id: null,
        client_name: 'Alice',
        client_email: 'alice@example.com',
        reservation_date: '2099-01-01',
        start_time: '10:00',
        end_time: '10:45',
        status: 'confirmed',
        service_name: 'Coupe Femme',
        at_client_home: false,
        client_address: null,
      },
    ]);
    reservationRepo.delete.mockResolvedValue({ affected: 1 });

    await service.remove(1);

    expect(mailService.sendStatusUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
  });

  it('remove does not notify the client when deleting an already refused/cancelled/completed reservation', async () => {
    for (const status of ['refused', 'cancelled', 'completed']) {
      mailService.sendStatusUpdate.mockClear();
      dataSource.query.mockResolvedValue([
        {
          group_id: null,
          client_name: 'Alice',
          client_email: 'alice@example.com',
          reservation_date: '2099-01-01',
          start_time: '10:00',
          end_time: '10:45',
          status,
          service_name: 'Coupe Femme',
          at_client_home: false,
          client_address: null,
        },
      ]);
      reservationRepo.delete.mockResolvedValue({ affected: 1 });

      await service.remove(1);

      expect(mailService.sendStatusUpdate).not.toHaveBeenCalled();
    }
  });

  it('removeGroup notifies the client when deleting a pending/confirmed group', async () => {
    dataSource.query.mockResolvedValue([
      {
        client_name: 'Mother',
        client_email: 'mother@example.com',
        reservation_date: '2099-01-01',
        start_time: '10:00',
        end_time: '10:45',
        status: 'confirmed',
        service_name: 'Coupe Femme',
        at_client_home: false,
        client_address: null,
      },
      {
        client_name: 'Daughter',
        client_email: 'mother@example.com',
        reservation_date: '2099-01-01',
        start_time: '10:45',
        end_time: '11:15',
        status: 'confirmed',
        service_name: 'Manucure Classique',
        at_client_home: false,
        client_address: null,
      },
    ]);
    reservationRepo.delete.mockResolvedValue({ affected: 2 });

    await service.removeGroup('some-group');

    expect(mailService.sendStatusUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'cancelled',
        guests: [
          expect.objectContaining({ name: 'Mother' }),
          expect.objectContaining({ name: 'Daughter' }),
        ],
      }),
    );
  });

  it('removeGroup does not notify when deleting an already refused group', async () => {
    dataSource.query.mockResolvedValue([
      {
        client_name: 'Mother',
        client_email: 'mother@example.com',
        reservation_date: '2099-01-01',
        start_time: '10:00',
        end_time: '10:45',
        status: 'refused',
        service_name: 'Coupe Femme',
        at_client_home: false,
        client_address: null,
      },
    ]);
    reservationRepo.delete.mockResolvedValue({ affected: 1 });

    await service.removeGroup('some-group');

    expect(mailService.sendStatusUpdate).not.toHaveBeenCalled();
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

  it('cancelByGroupId cancels a pending booking, notifies the client and pushes to the admin', async () => {
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT status')) return [{ status: 'pending', client_name: 'Mother', reservation_date: '2099-01-01' }];
      return [
        {
          client_name: 'Mother',
          client_email: 'mother@example.com',
          client_phone: '0600000000',
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
    expect(pushService.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Rendez-vous annulé par le client' }),
    );
    // The push alone can be missed (offline, push not enabled) — email is
    // the reliable fallback so the admin never simply doesn't find out.
    expect(mailService.sendAdminCancellationNotification).toHaveBeenCalledWith(
      expect.objectContaining({ clientName: 'Mother', clientEmail: 'mother@example.com', clientPhone: '0600000000' }),
    );
  });

  describe('promotions', () => {
    const STUDENT_RATE = { id: 1, label: 'Tarif étudiant', discount_percent: 10, requires_code: false, code: null, active: true };
    const WELCOME_CODE = { id: 2, label: 'Bienvenue', discount_percent: 20, requires_code: true, code: 'BIENVENUE20', active: true };

    it('resolvePublicGuestDiscounts applies a selectable rate only to the guest who picked it', async () => {
      promotionsService.findSelectable.mockResolvedValue([STUDENT_RATE]);
      const guests = [
        { name: 'Étudiante', serviceId: 1, addonIds: [], promotionId: 1 },
        { name: 'Sa mère', serviceId: 1, addonIds: [] },
      ];
      const result = await (service as any).resolvePublicGuestDiscounts(guests, undefined);
      expect(result).toEqual([
        { promotionId: 1, discountPercent: 10 },
        { promotionId: null, discountPercent: 0 },
      ]);
    });

    it('resolvePublicGuestDiscounts rejects a promotionId not in the selectable list', async () => {
      promotionsService.findSelectable.mockResolvedValue([STUDENT_RATE]);
      const guests = [{ name: 'Test', serviceId: 1, addonIds: [], promotionId: 999 }];
      await expect((service as any).resolvePublicGuestDiscounts(guests, undefined)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('resolvePublicGuestDiscounts applies a valid promo code to every guest without their own rate', async () => {
      promotionsService.findSelectable.mockResolvedValue([]);
      promotionsService.findByCode.mockResolvedValue(WELCOME_CODE);
      const guests = [
        { name: 'Alice', serviceId: 1, addonIds: [] },
        { name: 'Bob', serviceId: 1, addonIds: [] },
      ];
      const result = await (service as any).resolvePublicGuestDiscounts(guests, 'bienvenue20');
      expect(result).toEqual([
        { promotionId: 2, discountPercent: 20 },
        { promotionId: 2, discountPercent: 20 },
      ]);
    });

    it("resolvePublicGuestDiscounts lets a guest's own rate win over the order-wide code, for that guest only", async () => {
      promotionsService.findSelectable.mockResolvedValue([STUDENT_RATE]);
      promotionsService.findByCode.mockResolvedValue(WELCOME_CODE);
      const guests = [
        { name: 'Étudiante', serviceId: 1, addonIds: [], promotionId: 1 },
        { name: 'Sa mère', serviceId: 1, addonIds: [] },
      ];
      const result = await (service as any).resolvePublicGuestDiscounts(guests, 'bienvenue20');
      expect(result).toEqual([
        { promotionId: 1, discountPercent: 10 }, // her own rate, not the code
        { promotionId: 2, discountPercent: 20 }, // the order-wide code
      ]);
    });

    it('resolvePublicGuestDiscounts gives no discount when neither a rate nor a code is given', async () => {
      promotionsService.findSelectable.mockResolvedValue([]);
      const guests = [{ name: 'Test', serviceId: 1, addonIds: [] }];
      const result = await (service as any).resolvePublicGuestDiscounts(guests, undefined);
      expect(result).toEqual([{ promotionId: null, discountPercent: 0 }]);
    });

    it('resolveAdminPromotion applies any active promotion by id, code-based or not', async () => {
      promotionsService.findAll.mockResolvedValue([STUDENT_RATE, WELCOME_CODE]);
      const result = await (service as any).resolveAdminPromotion(2);
      expect(result).toEqual({ id: 2, discountPercent: 20 });
    });

    it('resolveAdminPromotion rejects an inactive promotion', async () => {
      promotionsService.findAll.mockResolvedValue([{ ...STUDENT_RATE, active: false }]);
      await expect((service as any).resolveAdminPromotion(1)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('resolveAdminPromotion returns null when no id is given', async () => {
      expect(await (service as any).resolveAdminPromotion(undefined)).toBeNull();
      expect(await (service as any).resolveAdminPromotion(null)).toBeNull();
    });

    it('createManual stores the resolved promotion_id and discount_percent on the reservation', async () => {
      serviceRepo.findOne.mockResolvedValue(HAIRCUT);
      noOverlap();
      promotionsService.findAll.mockResolvedValue([STUDENT_RATE]);

      const inserts: any[] = [];
      dataSource.transaction.mockImplementationOnce(async (fn) => {
        const manager = {
          insert: jest.fn(async (entity: unknown, payload: unknown) => {
            inserts.push({ entity, payload });
            return { identifiers: [{ id: 300 }] };
          }),
        };
        return fn(manager);
      });

      await service.createManual({
        serviceId: 1,
        clientName: 'Test',
        clientEmail: 'test@example.com',
        clientPhone: '0600000000',
        date: '2099-01-01',
        startTime: '10:00',
        promotionId: 1,
      } as any);

      const reservationInsert = inserts.find((i) => !Array.isArray(i.payload));
      expect(reservationInsert.payload).toMatchObject({ promotion_id: 1, discount_percent: 10 });
    });

    it('createManual defaults to no discount when no promotion is given', async () => {
      serviceRepo.findOne.mockResolvedValue(HAIRCUT);
      noOverlap();

      const inserts: any[] = [];
      dataSource.transaction.mockImplementationOnce(async (fn) => {
        const manager = {
          insert: jest.fn(async (entity: unknown, payload: unknown) => {
            inserts.push({ entity, payload });
            return { identifiers: [{ id: 301 }] };
          }),
        };
        return fn(manager);
      });

      await service.createManual({
        serviceId: 1,
        clientName: 'Test',
        clientEmail: 'test@example.com',
        clientPhone: '0600000000',
        date: '2099-01-01',
        startTime: '10:00',
      } as any);

      const reservationInsert = inserts.find((i) => !Array.isArray(i.payload));
      expect(reservationInsert.payload).toMatchObject({ promotion_id: null, discount_percent: 0 });
    });

    it("createManual applies a guest's own tarif spécial to that guest ONLY, not to the whole group (regression: was leaking to every prestation in the order)", async () => {
      serviceRepo.findOne.mockImplementation(({ where }: { where: { id: number } }) =>
        Promise.resolve(where.id === 1 ? HAIRCUT : MANICURE),
      );
      noOverlap();
      promotionsService.findAll.mockResolvedValue([STUDENT_RATE]);

      const inserts: any[] = [];
      dataSource.transaction.mockImplementationOnce(async (fn) => {
        const manager = {
          insert: jest.fn(async (_entity: unknown, payload: unknown) => {
            inserts.push(payload);
            return { identifiers: [{ id: inserts.length + 400 }] };
          }),
        };
        return fn(manager);
      });

      await service.createManual({
        serviceId: 1,
        clientName: 'Étudiante',
        clientEmail: 'test@example.com',
        clientPhone: '0600000000',
        date: '2099-01-01',
        startTime: '10:00',
        promotionId: 1, // her own "tarif étudiant"
        additionalGuests: [{ name: 'Sa mère', serviceId: 7 }], // no promotion of her own
      } as any);

      const reservationInserts = inserts.filter((p) => !Array.isArray(p));
      expect(reservationInserts).toHaveLength(2);
      expect(reservationInserts[0]).toMatchObject({ client_name: 'Étudiante', promotion_id: 1, discount_percent: 10 });
      expect(reservationInserts[1]).toMatchObject({ client_name: 'Sa mère', promotion_id: null, discount_percent: 0 });
    });
  });

  describe('updateReservation', () => {
    it('throws NotFoundException when the reservation does not exist', async () => {
      reservationRepo.findOne.mockResolvedValue(null);
      await expect(service.updateReservation(999, { notes: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when moved to a service that does not exist', async () => {
      reservationRepo.findOne.mockResolvedValue({
        id: 1,
        service_id: 1,
        client_name: 'Alice',
        client_email: 'a@example.com',
        client_phone: '0600000000',
        reservation_date: '2099-01-01',
        start_time: '10:00',
        end_time: '10:45',
        notes: '',
        at_client_home: false,
        client_address: null,
      });
      serviceRepo.findOne.mockResolvedValue(null);

      await expect(service.updateReservation(1, { serviceId: 999 })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates simple fields and recomputes end_time from the (possibly new) service duration', async () => {
      reservationRepo.findOne.mockResolvedValue({
        id: 1,
        service_id: 1,
        client_name: 'Alice',
        client_email: 'a@example.com',
        client_phone: '0600000000',
        reservation_date: '2099-01-01',
        start_time: '10:00',
        end_time: '10:45',
        notes: '',
        at_client_home: false,
        client_address: null,
      });
      serviceRepo.findOne.mockResolvedValue(MANICURE); // 30 min, was Coupe Femme (45 min)
      dataSource.query.mockResolvedValue([]);
      noOverlap();

      await service.updateReservation(1, { serviceId: 7, clientName: 'Alice Updated' });

      expect(dataSource.transaction).toHaveBeenCalled();
    });

    it('applies a new promotion when promotionId is provided', async () => {
      reservationRepo.findOne.mockResolvedValue({
        id: 1,
        service_id: 1,
        client_name: 'Alice',
        client_email: 'a@example.com',
        client_phone: '0600000000',
        reservation_date: '2099-01-01',
        start_time: '10:00',
        end_time: '10:45',
        notes: '',
        at_client_home: false,
        client_address: null,
        promotion_id: null,
        discount_percent: 0,
      });
      serviceRepo.findOne.mockResolvedValue(HAIRCUT);
      dataSource.query.mockResolvedValue([]);
      noOverlap();
      promotionsService.findAll.mockResolvedValue([{ id: 5, active: true, discount_percent: 15 }]);

      let updatePayload: any = null;
      dataSource.transaction.mockImplementationOnce(async (fn) => {
        const manager = { update: jest.fn((_entity, _id, payload) => (updatePayload = payload)), delete: jest.fn(), insert: jest.fn() };
        return fn(manager);
      });

      await service.updateReservation(1, { promotionId: 5 });

      expect(updatePayload).toMatchObject({ promotion_id: 5, discount_percent: 15 });
    });

    it('clears the promotion when promotionId is explicitly null', async () => {
      reservationRepo.findOne.mockResolvedValue({
        id: 1,
        service_id: 1,
        client_name: 'Alice',
        client_email: 'a@example.com',
        client_phone: '0600000000',
        reservation_date: '2099-01-01',
        start_time: '10:00',
        end_time: '10:45',
        notes: '',
        at_client_home: false,
        client_address: null,
        promotion_id: 5,
        discount_percent: 15,
      });
      serviceRepo.findOne.mockResolvedValue(HAIRCUT);
      dataSource.query.mockResolvedValue([]);
      noOverlap();

      let updatePayload: any = null;
      dataSource.transaction.mockImplementationOnce(async (fn) => {
        const manager = { update: jest.fn((_entity, _id, payload) => (updatePayload = payload)), delete: jest.fn(), insert: jest.fn() };
        return fn(manager);
      });

      await service.updateReservation(1, { promotionId: null });

      expect(updatePayload).toMatchObject({ promotion_id: null, discount_percent: 0 });
    });

    it('keeps the existing promotion untouched when promotionId is omitted', async () => {
      reservationRepo.findOne.mockResolvedValue({
        id: 1,
        service_id: 1,
        client_name: 'Alice',
        client_email: 'a@example.com',
        client_phone: '0600000000',
        reservation_date: '2099-01-01',
        start_time: '10:00',
        end_time: '10:45',
        notes: '',
        at_client_home: false,
        client_address: null,
        promotion_id: 5,
        discount_percent: 15,
      });
      serviceRepo.findOne.mockResolvedValue(HAIRCUT);
      dataSource.query.mockResolvedValue([]);
      noOverlap();

      let updatePayload: any = null;
      dataSource.transaction.mockImplementationOnce(async (fn) => {
        const manager = { update: jest.fn((_entity, _id, payload) => (updatePayload = payload)), delete: jest.fn(), insert: jest.fn() };
        return fn(manager);
      });

      await service.updateReservation(1, { notes: 'unrelated change' });

      expect(updatePayload).toMatchObject({ promotion_id: 5, discount_percent: 15 });
      expect(promotionsService.findAll).not.toHaveBeenCalled();
    });

    it('does not conflict with itself when saved unchanged (same slot)', async () => {
      reservationRepo.findOne.mockResolvedValue({
        id: 1,
        service_id: 1,
        client_name: 'Alice',
        client_email: 'a@example.com',
        client_phone: '0600000000',
        reservation_date: '2099-01-01',
        start_time: '10:00',
        end_time: '10:45',
        notes: '',
        at_client_home: false,
        client_address: null,
      });
      serviceRepo.findOne.mockResolvedValue(HAIRCUT);
      dataSource.query.mockResolvedValue([]);
      // The overlap query excludes this row's own id — simulate that by
      // returning no OTHER rows, same as noOverlap().
      noOverlap();

      await expect(service.updateReservation(1, {})).resolves.toBeUndefined();
    });

    it('throws ConflictException when the edited slot overlaps a different reservation', async () => {
      reservationRepo.findOne.mockResolvedValue({
        id: 1,
        service_id: 1,
        client_name: 'Alice',
        client_email: 'a@example.com',
        client_phone: '0600000000',
        reservation_date: '2099-01-01',
        start_time: '10:00',
        end_time: '10:45',
        notes: '',
        at_client_home: false,
        client_address: null,
      });
      serviceRepo.findOne.mockResolvedValue(HAIRCUT);
      dataSource.query.mockResolvedValue([]);
      reservationRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([{ start_time: '10:30', end_time: '11:15', at_client_home: false }]),
      });

      await expect(service.updateReservation(1, { startTime: '10:30' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows a genuinely overlapping edit when allowOverlap is set', async () => {
      reservationRepo.findOne.mockResolvedValue({
        id: 1,
        service_id: 1,
        client_name: 'Alice',
        client_email: 'a@example.com',
        client_phone: '0600000000',
        reservation_date: '2099-01-01',
        start_time: '10:00',
        end_time: '10:45',
        notes: '',
        at_client_home: false,
        client_address: null,
      });
      serviceRepo.findOne.mockResolvedValue(HAIRCUT);
      dataSource.query.mockResolvedValue([]);
      // No createQueryBuilder call expected — allowOverlap skips the "others"
      // lookup entirely, same as createManual.
      reservationRepo.createQueryBuilder.mockImplementation(() => {
        throw new Error('should not query for overlaps when allowOverlap is true');
      });

      await expect(service.updateReservation(1, { startTime: '10:30', allowOverlap: true })).resolves.toBeUndefined();
    });

    it('replaces reservation_addons when addonIds is provided', async () => {
      reservationRepo.findOne.mockResolvedValue({
        id: 1,
        service_id: 7,
        client_name: 'Alice',
        client_email: 'a@example.com',
        client_phone: '0600000000',
        reservation_date: '2099-01-01',
        start_time: '10:00',
        end_time: '10:30',
        notes: '',
        at_client_home: false,
        client_address: null,
      });
      serviceRepo.findOne.mockResolvedValue(MANICURE);
      addonRepo.find.mockResolvedValue([{ id: 50, service_id: 7, name: 'Nail Art', extra_price_cents: 1000, extra_duration_minutes: 15, active: true }]);
      noOverlap();

      let deleteCall: unknown;
      let insertCall: unknown;
      dataSource.transaction.mockImplementationOnce(async (fn) => {
        const manager = {
          update: jest.fn(),
          delete: jest.fn((...args) => {
            deleteCall = args;
          }),
          insert: jest.fn((...args) => {
            insertCall = args;
          }),
        };
        return fn(manager);
      });

      await service.updateReservation(1, { addonIds: [50] });

      expect(deleteCall).toBeTruthy();
      expect(insertCall).toBeTruthy();
    });

    it('keeps the existing addon snapshot when addonIds is not provided', async () => {
      reservationRepo.findOne.mockResolvedValue({
        id: 1,
        service_id: 7,
        client_name: 'Alice',
        client_email: 'a@example.com',
        client_phone: '0600000000',
        reservation_date: '2099-01-01',
        start_time: '10:00',
        end_time: '10:45',
        notes: '',
        at_client_home: false,
        client_address: null,
      });
      serviceRepo.findOne.mockResolvedValue(MANICURE);
      dataSource.query.mockResolvedValue([{ name: 'Nail Art', extra_price_cents: 1000, extra_duration_minutes: 15 }]);
      noOverlap();

      let deleteCalled = false;
      dataSource.transaction.mockImplementationOnce(async (fn) => {
        const manager = {
          update: jest.fn(),
          delete: jest.fn(() => {
            deleteCalled = true;
          }),
          insert: jest.fn(),
        };
        return fn(manager);
      });

      await service.updateReservation(1, { clientName: 'Alice Updated' });

      expect(deleteCalled).toBe(false);
    });

    it('re-sends the booking-received email to a corrected address when a pending reservation\'s email was a typo', async () => {
      reservationRepo.findOne.mockResolvedValue({
        id: 1,
        service_id: 1,
        client_name: 'Alice',
        client_email: 'alice@example.com',
        client_phone: '0600000000',
        reservation_date: '2099-01-01',
        start_time: '10:00',
        end_time: '10:45',
        notes: '',
        at_client_home: false,
        client_address: null,
        status: 'pending',
        group_id: null,
      });
      serviceRepo.findOne.mockResolvedValue(HAIRCUT);
      dataSource.query.mockResolvedValue([]);
      noOverlap();

      await service.updateReservation(1, { clientEmail: 'alice@example.fr' });

      expect(mailService.sendBookingReceived).toHaveBeenCalledWith(
        expect.objectContaining({ clientEmail: 'alice@example.fr' }),
      );
      expect(mailService.sendStatusUpdate).not.toHaveBeenCalled();
    });

    it('re-sends the confirmation email to a corrected address when a confirmed reservation\'s email was a typo', async () => {
      reservationRepo.findOne.mockResolvedValue({
        id: 1,
        service_id: 1,
        client_name: 'Alice',
        client_email: 'alice@example.com',
        client_phone: '0600000000',
        reservation_date: '2099-01-01',
        start_time: '10:00',
        end_time: '10:45',
        notes: '',
        at_client_home: false,
        client_address: null,
        status: 'confirmed',
        group_id: null,
      });
      serviceRepo.findOne.mockResolvedValue(HAIRCUT);
      dataSource.query.mockResolvedValue([]);
      noOverlap();

      await service.updateReservation(1, { clientEmail: 'alice@example.fr' });

      expect(mailService.sendStatusUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ clientEmail: 'alice@example.fr', status: 'confirmed' }),
      );
      expect(mailService.sendBookingReceived).not.toHaveBeenCalled();
    });

    it('does not re-send any email when the address is unchanged', async () => {
      reservationRepo.findOne.mockResolvedValue({
        id: 1,
        service_id: 1,
        client_name: 'Alice',
        client_email: 'alice@example.com',
        client_phone: '0600000000',
        reservation_date: '2099-01-01',
        start_time: '10:00',
        end_time: '10:45',
        notes: '',
        at_client_home: false,
        client_address: null,
        status: 'confirmed',
        group_id: null,
      });
      serviceRepo.findOne.mockResolvedValue(HAIRCUT);
      dataSource.query.mockResolvedValue([]);
      noOverlap();

      await service.updateReservation(1, { notes: 'unrelated change' });

      expect(mailService.sendBookingReceived).not.toHaveBeenCalled();
      expect(mailService.sendStatusUpdate).not.toHaveBeenCalled();
    });

    it('does not re-send an email for a cancelled reservation even if the address changes', async () => {
      reservationRepo.findOne.mockResolvedValue({
        id: 1,
        service_id: 1,
        client_name: 'Alice',
        client_email: 'alice@example.com',
        client_phone: '0600000000',
        reservation_date: '2099-01-01',
        start_time: '10:00',
        end_time: '10:45',
        notes: '',
        at_client_home: false,
        client_address: null,
        status: 'cancelled',
        group_id: null,
      });
      serviceRepo.findOne.mockResolvedValue(HAIRCUT);
      dataSource.query.mockResolvedValue([]);
      noOverlap();

      await service.updateReservation(1, { clientEmail: 'alice@example.fr' });

      expect(mailService.sendBookingReceived).not.toHaveBeenCalled();
      expect(mailService.sendStatusUpdate).not.toHaveBeenCalled();
    });
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
