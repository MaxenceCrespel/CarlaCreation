import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Snapshot of the addon(s) picked for one reservation row at booking time
// (name/price/duration copied, not a live FK to service_addons) — so a
// later rename/price change/deletion of the addon never rewrites what a
// client was actually shown and charged for a past booking.
@Entity('reservation_addons')
export class ReservationAddon {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  reservation_id: number;

  @Column()
  name: string;

  @Column({ default: 0 })
  extra_price_cents: number;

  @Column({ default: 0 })
  extra_duration_minutes: number;
}
