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

  // Shareable code ("parrainage") — generated lazily the first time the
  // client's account is loaded. See ClientAuthService.getProfile.
  @Column({ type: 'text', nullable: true, unique: true })
  referral_code: string | null;

  // Set at signup when the client entered a sponsor's code. The points for
  // both sides are only granted once this client's first reservation is
  // marked completed by the admin (referral_rewarded_at then records it).
  @Column({ type: 'int', nullable: true })
  referred_by_client_id: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  referral_rewarded_at: Date | null;

  // The calendar year a birthday reward was last issued — prevents
  // resending every day for the rest of the week the cron's lookahead
  // window covers. See RewardsService.sendBirthdayRewards.
  @Column({ type: 'int', nullable: true })
  birthday_reward_year: number | null;

  // Set once the client clicks the link emailed at signup (or resets their
  // password, which proves the same thing). An account can't log in before.
  @Column({ type: 'timestamptz', nullable: true })
  email_verified_at: Date | null;

  // Start of the 3-year inactivity clock — see AccountLifecycleService.purgeInactive.
  @Column({ type: 'timestamptz', nullable: true })
  last_login_at: Date | null;

  // Set when the "your account will be deleted" warning email went out.
  @Column({ type: 'timestamptz', nullable: true })
  purge_warned_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

export function normalizeClientName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}
