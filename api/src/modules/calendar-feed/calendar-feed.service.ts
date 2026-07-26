import * as crypto from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Admin } from '../../database/entities/admin.entity';
import { siteConfig } from '../../site-config';

interface ReservationIcsRow {
  id: number;
  client_name: string;
  client_email: string;
  client_phone: string;
  reservation_date: string;
  start_time: string;
  end_time: string;
  notes: string;
  status: 'pending' | 'confirmed' | 'completed';
  at_client_home: boolean;
  client_address: string | null;
  service_name: string;
}

// The server's own TZ is fixed to Europe/Paris (see api/Dockerfile), so
// `new Date(\`${date}T${time}:00\`)` is already interpreted as Paris local
// time — the same trick ReservationsService's reminder job relies on.
// Converting that to ISO/UTC then gives a correct instant year-round,
// across the DST change, with no timezone library needed.
function toIcsUtc(dateStr: string, timeStr: string): string {
  const d = new Date(`${dateStr}T${timeStr}:00`);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function icsNow(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

// Backslash, semicolon, comma and newline are the only characters RFC 5545
// requires escaping in TEXT values.
function icsEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

@Injectable()
export class CalendarFeedService {
  constructor(
    @InjectRepository(Admin) private readonly adminRepo: Repository<Admin>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async getToken(adminId: number): Promise<string | null> {
    const admin = await this.adminRepo.findOne({ where: { id: adminId } });
    if (!admin) {
      throw new NotFoundException('Compte introuvable.');
    }
    return admin.calendar_token;
  }

  // Also used for the very first generation — creating and rotating a
  // subscription link are the same action from the admin's point of view.
  async regenerateToken(adminId: number): Promise<string> {
    const admin = await this.adminRepo.findOne({ where: { id: adminId } });
    if (!admin) {
      throw new NotFoundException('Compte introuvable.');
    }
    admin.calendar_token = crypto.randomBytes(24).toString('hex');
    await this.adminRepo.save(admin);
    return admin.calendar_token;
  }

  // Returns null when the token doesn't match any admin (unknown/rotated
  // link) — the controller turns that into a 404, same treatment either way
  // so the response can't be used to probe for valid tokens.
  async buildIcs(token: string): Promise<string | null> {
    const admin = await this.adminRepo.findOne({ where: { calendar_token: token } });
    if (!admin) return null;

    const rows: ReservationIcsRow[] = await this.dataSource.query(
      `SELECT r.id, r.client_name, r.client_email, r.client_phone, r.reservation_date, r.start_time, r.end_time,
              r.notes, r.status, r.at_client_home, r.client_address, s.name AS service_name
       FROM reservations r
       JOIN services s ON s.id = r.service_id
       WHERE r.status NOT IN ('cancelled', 'refused')
       ORDER BY r.reservation_date ASC, r.start_time ASC`,
    );

    const dtstamp = icsNow();
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Carla Creation//Reservations//FR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${icsEscape(`${siteConfig.siteName} — Rendez-vous`)}`,
      // Hints for calendar apps that respect it (Apple/Google Calendar
      // subscriptions poll on their own schedule regardless, usually every
      // few hours) — not a guarantee, just a nudge.
      'X-PUBLISHED-TTL:PT1H',
      'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    ];

    for (const r of rows) {
      const location = r.at_client_home ? r.client_address ?? '' : siteConfig.siteAddress;
      const statusPrefix = r.status === 'pending' ? '[En attente] ' : '';
      const summary = `${statusPrefix}${r.service_name} — ${r.client_name}`;
      const descriptionParts = [
        `Client·e : ${r.client_name}`,
        r.client_phone ? `Téléphone : ${r.client_phone}` : null,
        r.client_email ? `Email : ${r.client_email}` : null,
        r.notes ? `Notes : ${r.notes}` : null,
      ].filter((line): line is string => Boolean(line));

      lines.push(
        'BEGIN:VEVENT',
        `UID:reservation-${r.id}@carla-creation-app`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${toIcsUtc(r.reservation_date, r.start_time)}`,
        `DTEND:${toIcsUtc(r.reservation_date, r.end_time)}`,
        `SUMMARY:${icsEscape(summary)}`,
        `LOCATION:${icsEscape(location)}`,
        `DESCRIPTION:${icsEscape(descriptionParts.join('\n'))}`,
        `STATUS:${r.status === 'pending' ? 'TENTATIVE' : 'CONFIRMED'}`,
        'END:VEVENT',
      );
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }
}
