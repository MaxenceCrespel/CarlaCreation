import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, ValueTransformer } from 'typeorm';

// Postgres NUMERIC comes back from `pg` as a string by default — same
// transformer as Reservation.travel_distance_km / TravelFeeTier.min_km.
const numericTransformer: ValueTransformer = {
  to: (value: number) => value,
  from: (value: string) => parseFloat(value),
};

// Manual stock tracking for consumables (hair colour, developer/oxidant,
// nail polish...) — no automatic decrement tied to prestations, Carla
// adjusts the quantity herself with +/- after using or restocking.
@Entity('products')
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  // Free-text unit label (e.g. "ml", "tube", "flacon") rather than an enum
  // — the range of consumables in a hair/nail studio is too varied to
  // enumerate up front.
  @Column({ default: 'unité' })
  unit: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0, transformer: numericTransformer })
  quantity: number;

  // Below this, the product shows as "stock bas" — 0 disables the alert
  // for products she doesn't want to track that closely.
  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0, transformer: numericTransformer })
  low_stock_threshold: number;

  @Column({ type: 'text', default: '' })
  notes: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
