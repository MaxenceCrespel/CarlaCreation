import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// A client profile, created explicitly by the admin (never automatically)
// when she confirms two bookings are the same person — see
// ClientsService.matchCandidates. normalized_name (lowercase, trimmed,
// collapsed whitespace) is only ever used to SUGGEST candidates for that
// confirmation; two people can legitimately share a name (e.g. a mother
// booking for herself, then later for her child), so it is deliberately
// not unique and never drives an automatic link.
@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  @Index()
  normalized_name: string;

  @Column({ default: '' })
  phone: string;

  @Column({ default: '' })
  email: string;

  @Column({ type: 'text', default: '' })
  notes: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

export function normalizeClientName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}
