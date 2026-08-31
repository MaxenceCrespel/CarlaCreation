import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, ValueTransformer } from 'typeorm';

// Postgres NUMERIC columns come back from `pg` as strings by default (to
// avoid silent float precision loss) — this reservation only ever stores a
// rounded km figure, so a plain JS number is safe and much easier to work
// with than threading string parsing through every caller.
const numericTransformer: ValueTransformer = {
  to: (value: number | null) => value,
  from: (value: string | null) => (value === null ? null : parseFloat(value)),
};

export type ReservationStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'refused';

// group_id links multiple rows created from a single booking request (e.g. a
// mother booking for herself and her daughter): one row per person/service,
// sharing the same group_id, contact info and date, with consecutive
// start/end times computed from each service's duration. NULL for solo
// bookings made before this feature existed.
@Entity('reservations')
@Index(['reservation_date'])
@Index(['group_id'])
export class Reservation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', nullable: true })
  group_id: string | null;

  @Column()
  service_id: number;

  @Column()
  client_name: string;

  @Column()
  client_email: string;

  @Column()
  client_phone: string;

  @Column({ type: 'text' })
  reservation_date: string;

  @Column({ type: 'text' })
  start_time: string;

  @Column({ type: 'text' })
  end_time: string;

  @Column({ default: '' })
  notes: string;

  @Column({ default: 'pending' })
  status: ReservationStatus;

  @Column({ default: false })
  reminder_sent: boolean;

  // Carla is a solo auto-entrepreneuse, not a fixed salon: false means the
  // client comes to her, true means she travels to client_address instead.
  @Column({ default: false })
  at_client_home: boolean;

  @Column({ type: 'text', nullable: true })
  client_address: string | null;

  // Computed once at booking time (create or edit) via the geocoding
  // service — null when geocoding is disabled/unconfigured or the address
  // couldn't be resolved, in which case travel_fee_cents still holds the
  // flat base fee alone.
  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true, transformer: numericTransformer })
  travel_distance_km: number | null;

  @Column({ type: 'int', nullable: true })
  travel_duration_minutes: number | null;

  @Column({ type: 'int', nullable: true })
  travel_fee_cents: number | null;

  // Set explicitly by the admin via the "fiche client" match/create flow —
  // never inferred automatically from client_name, since two different
  // people can share a name (see Client). Null until she confirms a link.
  @Column({ type: 'int', nullable: true })
  client_id: number | null;

  // discount_percent is a snapshot of the Promotion's percentage at
  // booking time (like ReservationAddon's name/price snapshot) — so a
  // later edit to the promotion's percent never reshapes a past booking's
  // revenue. 0 when no promotion applies (not nullable, so every revenue
  // sum can multiply by it unconditionally).
  @Column({ type: 'int', nullable: true })
  promotion_id: number | null;

  @Column({ type: 'int', default: 0 })
  discount_percent: number;

  // Only ever set by the client's own self-cancellation flow (see
  // ReservationsService.cancelByGroupId) — never by the admin cancelling a
  // reservation herself, since she already knows why.
  @Column({ type: 'text', nullable: true })
  cancellation_reason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
