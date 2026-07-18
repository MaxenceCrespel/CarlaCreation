import * as crypto from 'crypto';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Reservation } from '../../database/entities/reservation.entity';
import type { ReservationStatus } from '../../database/entities/reservation.entity';
import { Service } from '../../database/entities/service.entity';
import { getAvailableSlots, isValidDateString, toHHMM, toMinutes } from './slots.util';
import { AdditionalGuestDto, AdminCreateReservationDto, CreateReservationDto } from './dto/reservation.dto';
import { MailService } from '../mail/mail.service';

interface Guest {
  name: string;
  serviceId: number;
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
}

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Reservation) private readonly reservationRepo: Repository<Reservation>,
    @InjectRepository(Service) private readonly serviceRepo: Repository<Service>,
    private readonly mailService: MailService,
  ) {}

  async getAvailability(date: string, serviceIds: number[]): Promise<{ date: string; serviceIds: number[]; slots: string[] }> {
    const services = await this.resolveServices(serviceIds, { activeOnly: true });
    const totalDuration = services.reduce((sum, s) => sum + s.duration_minutes, 0);
    const slots = await getAvailableSlots(this.dataSource, date, totalDuration);
    return { date, serviceIds, slots };
  }

  // Scans forward from today (the admin's day-by-day schedule only ever
  // covers a 60-day rolling window, so that's the search horizon too) and
  // returns the very first open slot for the combined duration of the given
  // services — powers the "next available slot" suggestion on the booking
  // page so clients don't have to hunt through the day picker themselves.
  async findNextAvailable(serviceIds: number[]): Promise<{ date: string; startTime: string } | null> {
    const services = await this.resolveServices(serviceIds, { activeOnly: true });
    const totalDuration = services.reduce((sum, s) => sum + s.duration_minutes, 0);

    const HORIZON_DAYS = 60;
    const cursor = new Date();
    for (let i = 0; i < HORIZON_DAYS; i += 1) {
      const dateStr = cursor.toISOString().slice(0, 10);
      const slots = await getAvailableSlots(this.dataSource, dateStr, totalDuration);
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
      { name: dto.clientName, serviceId: dto.serviceId },
      ...(dto.additionalGuests ?? []).map((g: AdditionalGuestDto) => ({ name: g.name, serviceId: g.serviceId })),
    ];

    const services = await this.resolveServices(
      guests.map((g) => g.serviceId),
      { activeOnly: true },
    );
    const totalDuration = services.reduce((sum, s) => sum + s.duration_minutes, 0);

    const available = await getAvailableSlots(this.dataSource, dto.date, totalDuration);
    if (!available.includes(dto.startTime)) {
      throw new ConflictException("Ce créneau n'est plus disponible. Merci d'en choisir un autre.");
    }

    const result = await this.insertGroup(guests, services, {
      date: dto.date,
      startTime: dto.startTime,
      clientEmail: dto.clientEmail,
      clientPhone: dto.clientPhone,
      notes: dto.notes || '',
      status: 'pending',
    });

    await this.mailService.sendBookingReceived({
      clientName: dto.clientName,
      clientEmail: dto.clientEmail,
      date: result.date,
      guests: result.guests,
      groupId: result.groupId,
    });
    await this.mailService.sendAdminNewBookingNotification({
      clientName: dto.clientName,
      clientEmail: dto.clientEmail,
      clientPhone: dto.clientPhone,
      date: result.date,
      guests: result.guests,
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
      { name: dto.clientName, serviceId: dto.serviceId },
      ...(dto.additionalGuests ?? []).map((g: AdditionalGuestDto) => ({ name: g.name, serviceId: g.serviceId })),
    ];

    const services = await this.resolveServices(
      guests.map((g) => g.serviceId),
      { activeOnly: false },
    );
    const totalDuration = services.reduce((sum, s) => sum + s.duration_minutes, 0);

    const startMin = toMinutes(dto.startTime);
    const endMin = startMin + totalDuration;

    const existing = await this.reservationRepo
      .createQueryBuilder('r')
      .select(['r.start_time', 'r.end_time'])
      .where('r.reservation_date = :date', { date: dto.date })
      .andWhere('r.status NOT IN (:...excluded)', { excluded: ['cancelled', 'refused'] })
      .getMany();

    const overlaps = existing.some((r) => {
      const busyStart = toMinutes(r.start_time);
      const busyEnd = toMinutes(r.end_time);
      return startMin < busyEnd && endMin > busyStart;
    });
    if (overlaps) {
      throw new ConflictException('Ce créneau chevauche une réservation existante.');
    }

    const status = dto.status || 'confirmed';
    const result = await this.insertGroup(guests, services, {
      date: dto.date,
      startTime: dto.startTime,
      clientEmail: dto.clientEmail,
      clientPhone: dto.clientPhone,
      notes: dto.notes || '',
      status,
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
      });
    } else {
      await this.mailService.sendBookingReceived({
        clientName: dto.clientName,
        clientEmail: dto.clientEmail,
        date: result.date,
        guests: result.guests,
        groupId: result.groupId,
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

  private async insertGroup(
    guests: Guest[],
    services: Service[],
    common: { date: string; startTime: string; clientEmail: string; clientPhone: string; notes: string; status: ReservationStatus },
  ): Promise<{ groupId: string; date: string; startTime: string; endTime: string; guests: BookedGuest[] }> {
    const groupId = crypto.randomUUID();
    const bookedGuests: BookedGuest[] = [];
    let cursor = toMinutes(common.startTime);

    await this.dataSource.transaction(async (manager) => {
      for (let i = 0; i < guests.length; i += 1) {
        const guest = guests[i];
        const service = services[i];
        const startTime = toHHMM(cursor);
        const endTime = toHHMM(cursor + service.duration_minutes);

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
        });

        bookedGuests.push({
          id: Number(inserted.identifiers[0].id),
          name: guest.name,
          serviceId: guest.serviceId,
          serviceName: service.name,
          startTime,
          endTime,
        });
        cursor += service.duration_minutes;
      }
    });

    return {
      groupId,
      date: common.date,
      startTime: common.startTime,
      endTime: toHHMM(cursor),
      guests: bookedGuests,
    };
  }

  findAllForAdmin(): Promise<ReservationWithServiceRow[]> {
    return this.dataSource.query(
      `SELECT r.id, r.group_id, r.client_name, r.client_email, r.client_phone, r.reservation_date,
              r.start_time, r.end_time, r.notes, r.status, r.created_at, r.service_id,
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

    const rows: { group_id: string | null; client_name: string; client_email: string; reservation_date: string; start_time: string; end_time: string; service_name: string }[] =
      await this.dataSource.query(
        `SELECT r.group_id, r.client_name, r.client_email, r.reservation_date, r.start_time, r.end_time, s.name AS service_name
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
        guests: [{ name: row.client_name, serviceName: row.service_name, startTime: row.start_time, endTime: row.end_time }],
      });
    }
  }

  async remove(id: number): Promise<void> {
    const result = await this.reservationRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Réservation introuvable.');
    }
  }

  // Bulk actions on every reservation in a group (e.g. refuse the whole
  // family's booking at once instead of one row at a time).
  async updateGroupStatus(groupId: string, status: ReservationStatus): Promise<void> {
    const result = await this.reservationRepo.update({ group_id: groupId }, { status });
    if (result.affected === 0) {
      throw new NotFoundException('Groupe de réservations introuvable.');
    }

    const rows: { client_name: string; client_email: string; reservation_date: string; start_time: string; end_time: string; service_name: string }[] =
      await this.dataSource.query(
        `SELECT r.client_name, r.client_email, r.reservation_date, r.start_time, r.end_time, s.name AS service_name
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
        guests: rows.map((r) => ({ name: r.client_name, serviceName: r.service_name, startTime: r.start_time, endTime: r.end_time })),
      });
    }
  }

  async removeGroup(groupId: string): Promise<void> {
    const result = await this.reservationRepo.delete({ group_id: groupId });
    if (result.affected === 0) {
      throw new NotFoundException('Groupe de réservations introuvable.');
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
    }[] = await this.dataSource.query(
      `SELECT r.client_name, r.client_email, r.reservation_date, r.start_time, r.end_time, r.status, s.name AS service_name
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
              s.name AS service_name
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
        guests: groupRows.map((r) => ({ name: r.client_name, serviceName: r.service_name, startTime: r.start_time, endTime: r.end_time })),
      });
      await this.reservationRepo.update(
        groupRows.map((r) => r.id),
        { reminder_sent: true },
      );
    }
  }
}
