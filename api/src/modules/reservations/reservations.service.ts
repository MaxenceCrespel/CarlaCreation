import * as crypto from 'crypto';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Reservation } from '../../database/entities/reservation.entity';
import type { ReservationStatus } from '../../database/entities/reservation.entity';
import { Service } from '../../database/entities/service.entity';
import { ServiceAddon } from '../../database/entities/service-addon.entity';
import { ReservationAddon } from '../../database/entities/reservation-addon.entity';
import { effectiveInterval, getAvailableSlots, intervalsOverlap, isValidDateString, localDateString, toHHMM, toMinutes } from './slots.util';
import { AdditionalGuestDto, AdminCreateReservationDto, CreateReservationDto } from './dto/reservation.dto';
import { MailService } from '../mail/mail.service';
import { SettingsService } from '../settings/settings.service';

interface Guest {
  name: string;
  serviceId: number;
  addonIds: number[];
}

interface BookedGuest {
  id: number;
  name: string;
  serviceId: number;
  serviceName: string;
  startTime: string;
  endTime: string;
}

interface ReservationWithServiceRow {
  id: number;
  group_id: string | null;
  client_name: string;
  client_email: string;
  client_phone: string;
  reservation_date: string;
  start_time: string;
  end_time: string;
  notes: string;
  status: ReservationStatus;
  created_at: Date;
  service_id: number;
  service_name: string;
  at_client_home: boolean;
  client_address: string | null;
}

interface ReminderCandidateRow {
  id: number;
  group_id: string | null;
  client_name: string;
  client_email: string;
  reservation_date: string;
  start_time: string;
  end_time: string;
  service_name: string;
  at_client_home: boolean;
  client_address: string | null;
}

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Reservation) private readonly reservationRepo: Repository<Reservation>,
    @InjectRepository(Service) private readonly serviceRepo: Repository<Service>,
    @InjectRepository(ServiceAddon) private readonly addonRepo: Repository<ServiceAddon>,
    private readonly mailService: MailService,
    private readonly settingsService: SettingsService,
  ) {}

  async getAvailability(
    date: string,
    serviceIds: number[],
    atClientHome = false,
    addonMinutes = 0,
  ): Promise<{ date: string; serviceIds: number[]; slots: string[] }> {
    const services = await this.resolveServices(serviceIds, { activeOnly: true });
    const totalDuration = services.reduce((sum, s) => sum + s.duration_minutes, 0) + addonMinutes;
    const travelBufferMinutes = await this.settingsService.getTravelBufferMinutes();
    const slots = await getAvailableSlots(this.dataSource, date, totalDuration, atClientHome, travelBufferMinutes);
    return { date, serviceIds, slots };
  }

  // Scans forward from today (the admin's day-by-day schedule only ever
  // covers a 60-day rolling window, so that's the search horizon too) and
  // returns the very first open slot for the combined duration of the given
  // services — powers the "next available slot" suggestion on the booking
  // page so clients don't have to hunt through the day picker themselves.
  async findNextAvailable(
    serviceIds: number[],
    atClientHome = false,
    addonMinutes = 0,
  ): Promise<{ date: string; startTime: string } | null> {
    const services = await this.resolveServices(serviceIds, { activeOnly: true });
    const totalDuration = services.reduce((sum, s) => sum + s.duration_minutes, 0) + addonMinutes;
    const travelBufferMinutes = await this.settingsService.getTravelBufferMinutes();

    const HORIZON_DAYS = 60;
    const cursor = new Date();
    for (let i = 0; i < HORIZON_DAYS; i += 1) {
      const dateStr = localDateString(cursor);
      const slots = await getAvailableSlots(this.dataSource, dateStr, totalDuration, atClientHome, travelBufferMinutes);
      if (slots.length > 0) {
        return { date: dateStr, startTime: slots[0] };
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return null;
  }

  // Public booking: the primary contact (serviceId/clientName) plus any
  // additional guests (e.g. a mother booking for herself and her daughter)
  // are booked back-to-back as one linked group, sharing group_id, contact
  // info and date. The whole combined-duration block must be a genuinely
  // free, pre-computed slot — re-validated here to avoid race/tampering.
  async create(dto: CreateReservationDto) {
    const guests: Guest[] = [
      { name: dto.clientName, serviceId: dto.serviceId, addonIds: dto.addonIds ?? [] },
      ...(dto.additionalGuests ?? []).map((g: AdditionalGuestDto) => ({ name: g.name, serviceId: g.serviceId, addonIds: g.addonIds ?? [] })),
    ];

    const services = await this.resolveServices(
      guests.map((g) => g.serviceId),
      { activeOnly: true },
    );
    const addonsPerGuest = await this.resolveAddons(guests, { activeOnly: true });
    const totalDuration = services.reduce(
      (sum, s, i) => sum + s.duration_minutes + addonsPerGuest[i].reduce((a, addon) => a + addon.extra_duration_minutes, 0),
      0,
    );
    const atClientHome = dto.atClientHome ?? false;

    const travelBufferMinutes = await this.settingsService.getTravelBufferMinutes();
    const available = await getAvailableSlots(this.dataSource, dto.date, totalDuration, atClientHome, travelBufferMinutes);
    if (!available.includes(dto.startTime)) {
      throw new ConflictException("Ce créneau n'est plus disponible. Merci d'en choisir un autre.");
    }

    const result = await this.insertGroup(guests, services, addonsPerGuest, {
      date: dto.date,
      startTime: dto.startTime,
      clientEmail: dto.clientEmail,
      clientPhone: dto.clientPhone,
      notes: dto.notes || '',
      status: 'pending',
      atClientHome,
      clientAddress: atClientHome ? dto.clientAddress ?? null : null,
    });

    await this.mailService.sendBookingReceived({
      clientName: dto.clientName,
      clientEmail: dto.clientEmail,
      date: result.date,
      guests: result.guests,
      groupId: result.groupId,
      atClientHome,
      clientAddress: result.clientAddress,
    });
    await this.mailService.sendAdminNewBookingNotification({
      clientName: dto.clientName,
      clientEmail: dto.clientEmail,
      clientPhone: dto.clientPhone,
      date: result.date,
      guests: result.guests,
      atClientHome,
      clientAddress: result.clientAddress,
    });

    return result;
  }

  // Admin-only: log a reservation directly (walk-in, phone booking…),
  // bypassing the public "must be a pre-computed available slot" constraint
  // (so the admin can book outside opened hours or on an unset day) but
  // still enforcing a hard overlap check so two reservations can't collide.
  // Also supports additional guests, same as the public flow.
  async createManual(dto: AdminCreateReservationDto) {
    if (!isValidDateString(dto.date)) {
      throw new BadRequestException('Date invalide.');
    }

    const guests: Guest[] = [
      { name: dto.clientName, serviceId: dto.serviceId, addonIds: dto.addonIds ?? [] },
      ...(dto.additionalGuests ?? []).map((g: AdditionalGuestDto) => ({ name: g.name, serviceId: g.serviceId, addonIds: g.addonIds ?? [] })),
    ];

    const services = await this.resolveServices(
      guests.map((g) => g.serviceId),
      { activeOnly: false },
    );
    const addonsPerGuest = await this.resolveAddons(guests, { activeOnly: false });
    const totalDuration = services.reduce(
      (sum, s, i) => sum + s.duration_minutes + addonsPerGuest[i].reduce((a, addon) => a + addon.extra_duration_minutes, 0),
      0,
    );
    const atClientHome = dto.atClientHome ?? false;

    const travelBufferMinutes = await this.settingsService.getTravelBufferMinutes();
    const startMin = toMinutes(dto.startTime);
    const endMin = startMin + totalDuration;
    const candidate = effectiveInterval(startMin, endMin, atClientHome, travelBufferMinutes);

    const existing = await this.reservationRepo
      .createQueryBuilder('r')
      .select(['r.start_time', 'r.end_time', 'r.at_client_home'])
      .where('r.reservation_date = :date', { date: dto.date })
      .andWhere('r.status NOT IN (:...excluded)', { excluded: ['cancelled', 'refused'] })
      .getMany();

    const overlaps = existing.some((r) => {
      const busy = effectiveInterval(toMinutes(r.start_time), toMinutes(r.end_time), r.at_client_home, travelBufferMinutes);
      return intervalsOverlap(candidate, busy);
    });
    if (overlaps) {
      throw new ConflictException('Ce créneau chevauche une réservation existante (ou son temps de trajet).');
    }

    const status = dto.status || 'confirmed';
    const result = await this.insertGroup(guests, services, addonsPerGuest, {
      date: dto.date,
      startTime: dto.startTime,
      clientEmail: dto.clientEmail,
      clientPhone: dto.clientPhone,
      notes: dto.notes || '',
      status,
      atClientHome,
      clientAddress: atClientHome ? dto.clientAddress ?? null : null,
    });

    // A manual booking is usually entered as already-confirmed, so send the
    // matching email directly instead of a "request received" one.
    if (status === 'confirmed') {
      await this.mailService.sendStatusUpdate({
        clientName: dto.clientName,
        clientEmail: dto.clientEmail,
        date: result.date,
        guests: result.guests,
        groupId: result.groupId,
        status,
        atClientHome,
        clientAddress: result.clientAddress,
      });
    } else {
      await this.mailService.sendBookingReceived({
        clientName: dto.clientName,
        clientEmail: dto.clientEmail,
        date: result.date,
        guests: result.guests,
        groupId: result.groupId,
        atClientHome,
        clientAddress: result.clientAddress,
      });
    }

    return result;
  }

  private async resolveServices(serviceIds: number[], opts: { activeOnly: boolean }): Promise<Service[]> {
    if (serviceIds.length === 0) {
      throw new BadRequestException('Au moins une prestation est requise.');
    }
    const services = await Promise.all(
      serviceIds.map(async (id) => {
        const where = opts.activeOnly ? { id, active: true } : { id };
        const service = await this.serviceRepo.findOne({ where });
        if (!service) {
          throw new NotFoundException('Service introuvable.');
        }
        return service;
      }),
    );
    return services;
  }

  // Parallel to `guests` (same index per guest) — each guest's addonIds
  // must belong to THEIR OWN service, not just exist somewhere.
  private async resolveAddons(guests: Guest[], opts: { activeOnly: boolean }): Promise<ServiceAddon[][]> {
    return Promise.all(
      guests.map(async (guest) => {
        const ids = guest.addonIds ?? [];
        if (ids.length === 0) return [];

        const addons = await this.addonRepo.find({ where: { id: In(ids) } });
        if (addons.length !== ids.length) {
          throw new NotFoundException('Supplément introuvable.');
        }
        for (const addon of addons) {
          if (addon.service_id !== guest.serviceId) {
            throw new BadRequestException('Un supplément ne correspond pas à la prestation sélectionnée.');
          }
          if (opts.activeOnly && !addon.active) {
            throw new BadRequestException("Ce supplément n'est plus disponible.");
          }
        }
        return addons;
      }),
    );
  }

  private async insertGroup(
    guests: Guest[],
    services: Service[],
    addonsPerGuest: ServiceAddon[][],
    common: {
      date: string;
      startTime: string;
      clientEmail: string;
      clientPhone: string;
      notes: string;
      status: ReservationStatus;
      atClientHome: boolean;
      clientAddress: string | null;
    },
  ): Promise<{ groupId: string; date: string; startTime: string; endTime: string; guests: BookedGuest[]; atClientHome: boolean; clientAddress: string | null }> {
    const groupId = crypto.randomUUID();
    const bookedGuests: BookedGuest[] = [];
    let cursor = toMinutes(common.startTime);

    await this.dataSource.transaction(async (manager) => {
      for (let i = 0; i < guests.length; i += 1) {
        const guest = guests[i];
        const service = services[i];
        const addons = addonsPerGuest[i] ?? [];
        const addonDuration = addons.reduce((sum, a) => sum + a.extra_duration_minutes, 0);
        const duration = service.duration_minutes + addonDuration;
        const startTime = toHHMM(cursor);
        const endTime = toHHMM(cursor + duration);

        const inserted = await manager.insert(Reservation, {
          group_id: groupId,
          service_id: guest.serviceId,
          client_name: guest.name,
          client_email: common.clientEmail,
          client_phone: common.clientPhone,
          reservation_date: common.date,
          start_time: startTime,
          end_time: endTime,
          notes: common.notes,
          status: common.status,
          at_client_home: common.atClientHome,
          client_address: common.clientAddress,
        });
        const reservationId = Number(inserted.identifiers[0].id);

        if (addons.length > 0) {
          await manager.insert(
            ReservationAddon,
            addons.map((a) => ({
              reservation_id: reservationId,
              name: a.name,
              extra_price_cents: a.extra_price_cents,
              extra_duration_minutes: a.extra_duration_minutes,
            })),
          );
        }

        const serviceName = addons.length > 0 ? `${service.name} + ${addons.map((a) => a.name).join(', ')}` : service.name;

        bookedGuests.push({
          id: reservationId,
          name: guest.name,
          serviceId: guest.serviceId,
          serviceName,
          startTime,
          endTime,
        });
        cursor += duration;
      }
    });

    return {
      groupId,
      date: common.date,
      startTime: common.startTime,
      endTime: toHHMM(cursor),
      guests: bookedGuests,
      atClientHome: common.atClientHome,
      clientAddress: common.clientAddress,
    };
  }

  findAllForAdmin(): Promise<ReservationWithServiceRow[]> {
    return this.dataSource.query(
      `SELECT r.id, r.group_id, r.client_name, r.client_email, r.client_phone, r.reservation_date,
              r.start_time, r.end_time, r.notes, r.status, r.created_at, r.service_id,
              r.at_client_home, r.client_address,
              s.name AS service_name
       FROM reservations r
       JOIN services s ON s.id = r.service_id
       ORDER BY r.reservation_date DESC, r.start_time ASC`,
    );
  }

  async updateStatus(id: number, status: ReservationStatus): Promise<void> {
    const result = await this.reservationRepo.update(id, { status });
    if (result.affected === 0) {
      throw new NotFoundException('Réservation introuvable.');
    }

    const rows: {
      group_id: string | null;
      client_name: string;
      client_email: string;
      reservation_date: string;
      start_time: string;
      end_time: string;
      service_name: string;
      at_client_home: boolean;
      client_address: string | null;
    }[] = await this.dataSource.query(
      `SELECT r.group_id, r.client_name, r.client_email, r.reservation_date, r.start_time, r.end_time,
              r.at_client_home, r.client_address, s.name AS service_name
       FROM reservations r JOIN services s ON s.id = r.service_id WHERE r.id = $1`,
      [id],
    );
    const row = rows[0];
    if (row) {
      await this.mailService.sendStatusUpdate({
        clientName: row.client_name,
        clientEmail: row.client_email,
        date: row.reservation_date,
        status,
        groupId: row.group_id ?? undefined,
        atClientHome: row.at_client_home,
        clientAddress: row.client_address,
        guests: [{ name: row.client_name, serviceName: row.service_name, startTime: row.start_time, endTime: row.end_time }],
      });
    }
  }

  // Deleting is meant for cleaning up a mistake/spam entry, unlike
  // refuse/cancel (a real decision the client needs to know about) — but if
  // the row being deleted was still pending/confirmed (i.e. not yet past,
  // not already refused/cancelled), the client had a real upcoming
  // appointment and silently erasing it without a word would be worse than
  // sending the same "annulé" email refuse/cancel already sends.
  async remove(id: number): Promise<void> {
    const rows: {
      group_id: string | null;
      client_name: string;
      client_email: string;
      reservation_date: string;
      start_time: string;
      end_time: string;
      status: ReservationStatus;
      service_name: string;
      at_client_home: boolean;
      client_address: string | null;
    }[] = await this.dataSource.query(
      `SELECT r.group_id, r.client_name, r.client_email, r.reservation_date, r.start_time, r.end_time, r.status,
              r.at_client_home, r.client_address, s.name AS service_name
       FROM reservations r JOIN services s ON s.id = r.service_id WHERE r.id = $1`,
      [id],
    );
    const row = rows[0];

    const result = await this.reservationRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Réservation introuvable.');
    }

    if (row && (row.status === 'pending' || row.status === 'confirmed')) {
      await this.mailService.sendStatusUpdate({
        clientName: row.client_name,
        clientEmail: row.client_email,
        date: row.reservation_date,
        status: 'cancelled',
        groupId: row.group_id ?? undefined,
        atClientHome: row.at_client_home,
        clientAddress: row.client_address,
        guests: [{ name: row.client_name, serviceName: row.service_name, startTime: row.start_time, endTime: row.end_time }],
      });
    }
  }

  // Bulk actions on every reservation in a group (e.g. refuse the whole
  // family's booking at once instead of one row at a time).
  async updateGroupStatus(groupId: string, status: ReservationStatus): Promise<void> {
    const result = await this.reservationRepo.update({ group_id: groupId }, { status });
    if (result.affected === 0) {
      throw new NotFoundException('Groupe de réservations introuvable.');
    }

    const rows: {
      client_name: string;
      client_email: string;
      reservation_date: string;
      start_time: string;
      end_time: string;
      service_name: string;
      at_client_home: boolean;
      client_address: string | null;
    }[] = await this.dataSource.query(
      `SELECT r.client_name, r.client_email, r.reservation_date, r.start_time, r.end_time,
              r.at_client_home, r.client_address, s.name AS service_name
       FROM reservations r JOIN services s ON s.id = r.service_id WHERE r.group_id = $1 ORDER BY r.start_time ASC`,
      [groupId],
    );

    if (rows.length > 0) {
      const [primary] = rows;
      await this.mailService.sendStatusUpdate({
        clientName: primary.client_name,
        clientEmail: primary.client_email,
        date: primary.reservation_date,
        status,
        groupId,
        atClientHome: primary.at_client_home,
        clientAddress: primary.client_address,
        guests: rows.map((r) => ({ name: r.client_name, serviceName: r.service_name, startTime: r.start_time, endTime: r.end_time })),
      });
    }
  }

  async removeGroup(groupId: string): Promise<void> {
    const rows: {
      client_name: string;
      client_email: string;
      reservation_date: string;
      start_time: string;
      end_time: string;
      status: ReservationStatus;
      service_name: string;
      at_client_home: boolean;
      client_address: string | null;
    }[] = await this.dataSource.query(
      `SELECT r.client_name, r.client_email, r.reservation_date, r.start_time, r.end_time, r.status,
              r.at_client_home, r.client_address, s.name AS service_name
       FROM reservations r JOIN services s ON s.id = r.service_id WHERE r.group_id = $1 ORDER BY r.start_time ASC`,
      [groupId],
    );

    const result = await this.reservationRepo.delete({ group_id: groupId });
    if (result.affected === 0) {
      throw new NotFoundException('Groupe de réservations introuvable.');
    }

    const [primary] = rows;
    if (primary && (primary.status === 'pending' || primary.status === 'confirmed')) {
      await this.mailService.sendStatusUpdate({
        clientName: primary.client_name,
        clientEmail: primary.client_email,
        date: primary.reservation_date,
        status: 'cancelled',
        groupId,
        atClientHome: primary.at_client_home,
        clientAddress: primary.client_address,
        guests: rows.map((r) => ({ name: r.client_name, serviceName: r.service_name, startTime: r.start_time, endTime: r.end_time })),
      });
    }
  }

  // Public "manage my booking" lookup — group_id is a crypto.randomUUID(),
  // unguessable, so it doubles as the access token for this link (sent in
  // the confirmation email). No separate auth needed for a client to view
  // or cancel their own booking.
  async findByGroupId(groupId: string) {
    const rows: {
      client_name: string;
      client_email: string;
      reservation_date: string;
      start_time: string;
      end_time: string;
      status: ReservationStatus;
      service_name: string;
      at_client_home: boolean;
      client_address: string | null;
    }[] = await this.dataSource.query(
      `SELECT r.client_name, r.client_email, r.reservation_date, r.start_time, r.end_time, r.status,
              r.at_client_home, r.client_address, s.name AS service_name
       FROM reservations r JOIN services s ON s.id = r.service_id WHERE r.group_id = $1 ORDER BY r.start_time ASC`,
      [groupId],
    );
    if (rows.length === 0) {
      throw new NotFoundException('Réservation introuvable.');
    }

    const [primary] = rows;
    return {
      groupId,
      clientName: primary.client_name,
      clientEmail: primary.client_email,
      date: primary.reservation_date,
      status: primary.status,
      atClientHome: primary.at_client_home,
      clientAddress: primary.client_address,
      guests: rows.map((r) => ({ name: r.client_name, serviceName: r.service_name, startTime: r.start_time, endTime: r.end_time })),
    };
  }

  async cancelByGroupId(groupId: string): Promise<void> {
    const rows: { status: ReservationStatus }[] = await this.dataSource.query(
      `SELECT status FROM reservations WHERE group_id = $1 LIMIT 1`,
      [groupId],
    );
    if (rows.length === 0) {
      throw new NotFoundException('Réservation introuvable.');
    }
    if (rows[0].status === 'cancelled') {
      throw new BadRequestException('Ce rendez-vous est déjà annulé.');
    }
    if (rows[0].status === 'completed') {
      throw new BadRequestException('Ce rendez-vous est déjà passé, il ne peut plus être annulé.');
    }

    await this.updateGroupStatus(groupId, 'cancelled');
  }

  // Runs every 10 minutes so a reservation crossing the "24h before" mark
  // is caught quickly without needing precise per-booking scheduling.
  // reminder_sent guards against duplicate emails across runs.
  @Cron(CronExpression.EVERY_10_MINUTES)
  async sendDueReminders(): Promise<void> {
    try {
      await this.dispatchDueReminders();
    } catch (err) {
      this.logger.error(`Reminder job failed: ${(err as Error).message}`);
    }
  }

  async dispatchDueReminders(): Promise<void> {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const rows: ReminderCandidateRow[] = await this.dataSource.query(
      `SELECT r.id, r.group_id, r.client_name, r.client_email, r.reservation_date, r.start_time, r.end_time,
              r.at_client_home, r.client_address, s.name AS service_name
       FROM reservations r
       JOIN services s ON s.id = r.service_id
       WHERE r.status = 'confirmed' AND r.reminder_sent = false`,
    );

    const due = rows.filter((r) => {
      const appointment = new Date(`${r.reservation_date}T${r.start_time}:00`);
      return appointment > now && appointment <= in24h;
    });
    if (due.length === 0) return;

    const groups = new Map<string, ReminderCandidateRow[]>();
    for (const row of due) {
      const key = row.group_id ?? `single-${row.id}`;
      const bucket = groups.get(key) ?? [];
      bucket.push(row);
      groups.set(key, bucket);
    }

    for (const groupRows of groups.values()) {
      const [primary] = groupRows;
      await this.mailService.sendReminder({
        clientName: primary.client_name,
        clientEmail: primary.client_email,
        date: primary.reservation_date,
        groupId: primary.group_id ?? undefined,
        atClientHome: primary.at_client_home,
        clientAddress: primary.client_address,
        guests: groupRows.map((r) => ({ name: r.client_name, serviceName: r.service_name, startTime: r.start_time, endTime: r.end_time })),
      });
      await this.reservationRepo.update(
        groupRows.map((r) => r.id),
        { reminder_sent: true },
      );
    }
  }
}
