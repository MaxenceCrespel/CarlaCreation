import { Column, Entity, PrimaryGeneratedColumn, ValueTransformer } from 'typeorm';

// Postgres NUMERIC comes back from `pg` as a string by default — see the
// identical transformer on Reservation.travel_distance_km.
const numericTransformer: ValueTransformer = {
  to: (value: number) => value,
  from: (value: string) => parseFloat(value),
};

// A step function for the à-domicile travel fee: the applicable fee is the
// fee_cents of the tier with the largest min_km at or below the client's
// actual distance — not cumulative, not per-km beyond the threshold. A
// min_km=0 tier (usually fee_cents=0) is always required, defining the
// free radius shown to clients before they even enter their address.
@Entity('travel_fee_tiers')
export class TravelFeeTier {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'numeric', precision: 6, scale: 2, transformer: numericTransformer })
  min_km: number;

  @Column({ default: 0 })
  fee_cents: number;
}
