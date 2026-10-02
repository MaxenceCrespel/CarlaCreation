import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// A client profile — either created explicitly by the admin (never
// automatically) when she confirms two bookings are the same person, see
// ClientsService.matchCandidates, or self-registered by the client via
// ClientAuthService.signup (password_hash then set). A fiche can exist in
// either state, or both at once (a self-registered client claims an
// existing admin-created fiche by email, see signup). normalized_name
// (lowercase, trimmed, collapsed whitespace) is only ever used to SUGGEST
// admin-matching candidates; two people can legitimately share a name
// (e.g. a mother booking for herself, then later for her child), so it is
// deliberately not unique and never drives an automatic link.
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

  // Null = admin-created fiche only, no self-service account (can't log
  // in). Set once the client registers — see ClientAuthService.signup.
  @Column({ type: 'text', nullable: true })
  password_hash: string | null;

  // 'YYYY-MM-DD', same string format as Reservation.reservation_date —
  // only the month/day are ever used (see RewardsService's birthday
  // check), the year is just whatever the client typed and never
  // displayed as an age. Settable at signup or admin edit.
  @Column({ type: 'text', nullable: true })
  birthdate: string | null;

  // The completed-visit count at which the last loyalty reward code was
  // issued — compared against a fresh count each time, so reaching the
  // same multiple twice (shouldn't happen, but) never double-issues. Null
  // = never rewarded yet. See RewardsService.checkLoyaltyReward.
  @Column({ type: 'int', nullable: true })
  loyalty_reward_at_visits: number | null;

  // The calendar year a birthday reward was last issued — prevents
  // resending every day for the rest of the week the cron's lookahead
  // window covers. See RewardsService.sendBirthdayRewards.
  @Column({ type: 'int', nullable: true })
  birthday_reward_year: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

export function normalizeClientName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}
