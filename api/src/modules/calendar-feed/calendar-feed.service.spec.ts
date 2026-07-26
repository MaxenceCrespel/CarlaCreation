// toIcsUtc's correctness depends on the process running in Europe/Paris —
// same as production (api/Dockerfile sets ENV TZ=Europe/Paris before node
// even starts). Mutating process.env.TZ mid-process (e.g. via a plain
// `import '../../config'` here) is NOT reliably picked up by Node's
// Date/Intl internals on every platform — confirmed by this exact test
// failing in CI despite passing locally. TZ must be set in the *shell*
// before the process starts instead — see the "test"/"test:cov" scripts
// in package.json.
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { CalendarFeedService } from './calendar-feed.service';
import { Admin } from '../../database/entities/admin.entity';

describe('CalendarFeedService', () => {
  let service: CalendarFeedService;
  let adminRepo: { findOne: jest.Mock; save: jest.Mock };
  let dataSource: { query: jest.Mock };

  beforeEach(async () => {
    adminRepo = { findOne: jest.fn(), save: jest.fn((v) => Promise.resolve(v)) };
    dataSource = { query: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarFeedService,
        { provide: getRepositoryToken(Admin), useValue: adminRepo },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = module.get(CalendarFeedService);
  });

  describe('getToken', () => {
    it('throws NotFoundException for a missing admin', async () => {
      adminRepo.findOne.mockResolvedValue(null);
      await expect(service.getToken(999)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the stored token (or null)', async () => {
      adminRepo.findOne.mockResolvedValue({ id: 1, calendar_token: 'abc123' });
      await expect(service.getToken(1)).resolves.toBe('abc123');
    });
  });

  describe('regenerateToken', () => {
    it('throws NotFoundException for a missing admin', async () => {
      adminRepo.findOne.mockResolvedValue(null);
      await expect(service.regenerateToken(999)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('generates and persists a new random token, different from the old one', async () => {
      const admin = { id: 1, calendar_token: 'old-token' };
      adminRepo.findOne.mockResolvedValue(admin);

      const token = await service.regenerateToken(1);

      expect(token).toBeTruthy();
      expect(token).not.toBe('old-token');
      expect(adminRepo.save).toHaveBeenCalledWith(expect.objectContaining({ calendar_token: token }));
    });
  });

  describe('buildIcs', () => {
    it('returns null for an unknown token', async () => {
      adminRepo.findOne.mockResolvedValue(null);
      await expect(service.buildIcs('nope')).resolves.toBeNull();
    });

    it('renders a valid VCALENDAR with one VEVENT per non-cancelled/refused reservation', async () => {
      adminRepo.findOne.mockResolvedValue({ id: 1, calendar_token: 'tok' });
      dataSource.query.mockResolvedValue([
        {
          id: 42,
          client_name: 'Alice Martin',
          client_email: 'alice@example.com',
          client_phone: '0600000000',
          reservation_date: '2026-08-01',
          start_time: '10:00',
          end_time: '10:45',
          notes: 'Préfère un vernis nude',
          status: 'confirmed',
          at_client_home: false,
          client_address: null,
          service_name: 'Coupe Femme',
        },
      ]);

      const ics = await service.buildIcs('tok');

      expect(ics).toBeTruthy();
      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('END:VCALENDAR');
      expect(ics).toContain('BEGIN:VEVENT');
      expect(ics).toContain('UID:reservation-42@carla-creation-app');
      expect(ics).toContain('SUMMARY:Coupe Femme — Alice Martin');
      expect(ics).toContain('STATUS:CONFIRMED');
      // 2026-08-01 10:00 Paris time (CEST, UTC+2) = 08:00 UTC
      expect(ics).toContain('DTSTART:20260801T080000Z');
      expect(ics).toContain('DTEND:20260801T084500Z');
    });

    it('prefixes pending reservations and marks them TENTATIVE', async () => {
      adminRepo.findOne.mockResolvedValue({ id: 1, calendar_token: 'tok' });
      dataSource.query.mockResolvedValue([
        {
          id: 43,
          client_name: 'Bob',
          client_email: 'bob@example.com',
          client_phone: '0600000000',
          reservation_date: '2026-08-01',
          start_time: '11:00',
          end_time: '11:30',
          notes: '',
          status: 'pending',
          at_client_home: false,
          client_address: null,
          service_name: 'Coupe Homme',
        },
      ]);

      const ics = await service.buildIcs('tok');

      expect(ics).toContain('SUMMARY:[En attente] Coupe Homme — Bob');
      expect(ics).toContain('STATUS:TENTATIVE');
    });

    it('uses the client\'s own address for à-domicile bookings', async () => {
      adminRepo.findOne.mockResolvedValue({ id: 1, calendar_token: 'tok' });
      dataSource.query.mockResolvedValue([
        {
          id: 44,
          client_name: 'Chloé',
          client_email: 'chloe@example.com',
          client_phone: '0600000000',
          reservation_date: '2026-08-01',
          start_time: '14:00',
          end_time: '14:30',
          notes: '',
          status: 'confirmed',
          at_client_home: true,
          client_address: '12 rue des Lilas, 59120 Loos',
          service_name: 'Manucure',
        },
      ]);

      const ics = await service.buildIcs('tok');

      expect(ics).toContain('LOCATION:12 rue des Lilas\\, 59120 Loos');
    });
  });
});
