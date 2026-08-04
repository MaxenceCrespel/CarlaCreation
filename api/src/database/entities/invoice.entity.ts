import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { InvoiceItem } from './invoice-item.entity';

export type InvoiceStatus = 'unpaid' | 'paid';

// Client info is a snapshot copied at creation time (like ReservationAddon
// snapshots addon name/price) — never a live join to Reservation, so an
// issued invoice never silently changes if the reservation is later edited
// or deleted. `legal_mentions` stays null until Carla is officially
// déclarée auto-entrepreneuse (SIRET etc.) — reserved so that field can be
// filled in later without a schema change.
@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn()
  id: number;

  // Formatted as "F-000001" once the row has an id (set in a follow-up
  // UPDATE right after insert, see InvoicesService.create) — kept as a
  // real unique column rather than computed on read so it never changes.
  @Column({ type: 'text', unique: true })
  number: string;

  @Column({ type: 'int', nullable: true })
  @Index()
  reservation_id: number | null;

  @Column()
  client_name: string;

  @Column({ default: '' })
  client_email: string;

  @Column({ default: '' })
  client_phone: string;

  @Column({ default: '' })
  client_address: string;

  @Column({ type: 'date' })
  issue_date: string;

  @Column({ default: 'unpaid' })
  status: InvoiceStatus;

  @Column({ type: 'text', nullable: true })
  payment_method: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  paid_at: Date | null;

  @Column({ type: 'int', default: 0 })
  total_cents: number;

  @Column({ default: '' })
  notes: string;

  @Column({ type: 'text', nullable: true })
  legal_mentions: string | null;

  @OneToMany(() => InvoiceItem, (item) => item.invoice, { cascade: true })
  items: InvoiceItem[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
