import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Client, normalizeClientName } from '../../database/entities/client.entity';
import { Reservation } from '../../database/entities/reservation.entity';
import { CreateAndLinkClientDto, CreateClientDto, UpdateClientDto } from './dto/client.dto';

interface ReservationHistoryRow {
  id: number;
  reservation_date: string;
  start_time: string;
  service_name: string;
  status: string;
}

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client) private readonly clientRepo: Repository<Client>,
    @InjectRepository(Reservation) private readonly reservationRepo: Repository<Reservation>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // No @OneToMany declared on Client (this codebase favours explicit
  // queries over ORM relation graphs, see Service/ServiceAddon) — the
  // reservation count per client is a separate raw query below.
  async findAll(
    q?: string,
  ): Promise<((Client & { reservationCount: number; hasFiche: true }) | { hasFiche: false; name: string; phone: string; email: string })[]> {
    const clients = await this.clientRepo.find({ order: { name: 'ASC' } });
    const needle = q?.trim();

    if (!needle) {
      const counts = await this.reservationCountsFor(clients.map((c) => c.id));
      return clients.map((c) => ({ ...c, reservationCount: counts.get(c.id) ?? 0, hasFiche: true as const }));
    }

    // Match on name OR phone — a search that only checked the name meant an
    // admin trying to place a call by number could never find the fiche
    // that already has it.
    const normalizedNeedle = normalizeClientName(needle);
    const digitsNeedle = needle.replace(/\D/g, '');
    const matchesPhone = (phone: string) => digitsNeedle.length >= 3 && phone.replace(/\D/g, '').includes(digitsNeedle);

    const ficheMatches = clients.filter((c) => c.normalized_name.includes(normalizedNeedle) || matchesPhone(c.phone));
    const counts = await this.reservationCountsFor(ficheMatches.map((c) => c.id));
    const ficheResults = ficheMatches.map((c) => ({ ...c, reservationCount: counts.get(c.id) ?? 0, hasFiche: true as const }));

    // Also surface people who've booked before but were never turned into a
    // "fiche" — the case this was built for: the admin gets a call from a
    // number she doesn't recognise, but it's actually a past client. Skip
    // any phone already covered by a fiche match above so the same person
    // doesn't show up twice.
    const coveredPhones = new Set(ficheMatches.map((c) => c.phone.replace(/\D/g, '')).filter(Boolean));
    const historyRows: { client_name: string; client_email: string; client_phone: string }[] = await this.dataSource.query(
      `SELECT DISTINCT ON (client_phone) client_name, client_email, client_phone
       FROM reservations
       WHERE client_name ILIKE $1 OR (LENGTH($2) >= 3 AND regexp_replace(client_phone, '\\D', '', 'g') ILIKE $3)
       ORDER BY client_phone, reservation_date DESC`,
      [`%${needle}%`, digitsNeedle, `%${digitsNeedle}%`],
    );
    const historyResults = historyRows
      .filter((r) => r.client_phone && !coveredPhones.has(r.client_phone.replace(/\D/g, '')))
      .map((r) => ({ hasFiche: false as const, name: r.client_name, phone: r.client_phone, email: r.client_email }));

    return [...ficheResults, ...historyResults];
  }

  private async reservationCountsFor(clientIds: number[]): Promise<Map<number, number>> {
    if (clientIds.length === 0) return new Map();
    const counts: { client_id: number; count: string }[] = await this.dataSource.query(
      `SELECT client_id, COUNT(*)::int AS count FROM reservations WHERE client_id = ANY($1) GROUP BY client_id`,
      [clientIds],
    );
    return new Map(counts.map((c) => [c.client_id, Number(c.count)]));
  }

  async findOne(id: number): Promise<Client & { history: ReservationHistoryRow[] }> {
    const client = await this.clientRepo.findOne({ where: { id } });
    if (!client) throw new NotFoundException('Fiche client introuvable.');

    const history: ReservationHistoryRow[] = await this.dataSource.query(
      `SELECT r.id, r.reservation_date, r.start_time, r.status, s.name AS service_name
       FROM reservations r JOIN services s ON s.id = r.service_id
       WHERE r.client_id = $1
       ORDER BY r.reservation_date DESC, r.start_time DESC`,
      [id],
    );

    return { ...client, history };
  }

  // Suggests existing profiles for the admin to review — an exact match on
  // the normalized name only, never fuzzy. Deliberately does not merge or
  // auto-link anything: the admin always makes the final call (see the
  // "mère qui reprend rdv pour son enfant" case this was built for).
  async matchCandidates(name: string): Promise<(Client & { history: ReservationHistoryRow[] })[]> {
    const normalized = normalizeClientName(name);
    if (!normalized) return [];
    const candidates = await this.clientRepo.find({ where: { normalized_name: normalized } });
    if (candidates.length === 0) return [];

    const history: ReservationHistoryRow[] = await this.dataSource.query(
      `SELECT r.id, r.client_id, r.reservation_date, r.start_time, r.status, s.name AS service_name
       FROM reservations r JOIN services s ON s.id = r.service_id
       WHERE r.client_id = ANY($1)
       ORDER BY r.reservation_date DESC, r.start_time DESC`,
      [candidates.map((c) => c.id)],
    );
    const historyByClient = new Map<number, ReservationHistoryRow[]>();
    for (const row of history as (ReservationHistoryRow & { client_id: number })[]) {
      const list = historyByClient.get(row.client_id) ?? [];
      list.push(row);
      historyByClient.set(row.client_id, list);
    }

    return candidates.map((c) => ({ ...c, history: (historyByClient.get(c.id) ?? []).slice(0, 5) }));
  }

  // Autocomplete for the "create a manual reservation" form — sourced from
  // past reservations' own denormalized client_name/email/phone rather than
  // the Client table, so it also surfaces people who booked but were never
  // turned into a "fiche client". Most recent booking per distinct name wins
  // when suggesting an email/phone to prefill.
  async suggestFromHistory(q: string): Promise<{ name: string; email: string; phone: string }[]> {
    const query = q.trim();
    if (query.length < 2) return [];

    const rows: { client_name: string; client_email: string; client_phone: string }[] = await this.dataSource.query(
      `SELECT client_name, client_email, client_phone FROM (
         SELECT DISTINCT ON (LOWER(client_name)) client_name, client_email, client_phone, reservation_date, start_time
         FROM reservations
         WHERE client_name ILIKE $1
         ORDER BY LOWER(client_name), reservation_date DESC, start_time DESC
       ) recent
       ORDER BY reservation_date DESC, start_time DESC
       LIMIT 8`,
      [`%${query}%`],
    );

    return rows.map((r) => ({ name: r.client_name, email: r.client_email, phone: r.client_phone }));
  }

  async create(dto: CreateClientDto): Promise<Client> {
    const client = this.clientRepo.create({
      name: dto.name.trim(),
      normalized_name: normalizeClientName(dto.name),
      phone: dto.phone?.trim() ?? '',
      email: dto.email?.trim() ?? '',
      notes: dto.notes?.trim() ?? '',
    });
    return this.clientRepo.save(client);
  }

  async createAndLink(dto: CreateAndLinkClientDto): Promise<Client> {
    const reservation = await this.reservationRepo.findOne({ where: { id: dto.reservationId } });
    if (!reservation) throw new NotFoundException('Réservation introuvable.');

    const client = await this.create(dto);
    await this.reservationRepo.update({ id: dto.reservationId }, { client_id: client.id });
    return client;
  }

  async update(id: number, dto: UpdateClientDto): Promise<Client> {
    const client = await this.clientRepo.findOne({ where: { id } });
    if (!client) throw new NotFoundException('Fiche client introuvable.');

    if (dto.name !== undefined) {
      client.name = dto.name.trim();
      client.normalized_name = normalizeClientName(dto.name);
    }
    if (dto.phone !== undefined) client.phone = dto.phone.trim();
    if (dto.email !== undefined) client.email = dto.email.trim();
    if (dto.notes !== undefined) client.notes = dto.notes.trim();

    return this.clientRepo.save(client);
  }

  async remove(id: number): Promise<void> {
    const result = await this.clientRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException('Fiche client introuvable.');
  }

  async link(reservationId: number, clientId: number): Promise<void> {
    const client = await this.clientRepo.findOne({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Fiche client introuvable.');

    const result = await this.reservationRepo.update({ id: reservationId }, { client_id: clientId });
    if (result.affected === 0) throw new NotFoundException('Réservation introuvable.');
  }

  async unlink(reservationId: number): Promise<void> {
    const result = await this.reservationRepo.update({ id: reservationId }, { client_id: null });
    if (result.affected === 0) throw new NotFoundException('Réservation introuvable.');
  }
}
