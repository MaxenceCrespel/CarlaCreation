import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// 'authorized': the card was validated and the amount is on hold
// (Stripe's manual-capture PaymentIntent) but not yet actually charged —
// happens as soon as checkout completes. It only becomes 'paid' once
// Carla confirms the appointment (see ReservationsService.
// settlePaymentForGroupStatus), so refusing a still-pending request never
// touches real money: the hold is just released ('canceled'), no refund
// needed.
export type PaymentStatus = 'pending' | 'authorized' | 'paid' | 'refunded' | 'partially_refunded' | 'canceled';

// One row per booking group (see Reservation.group_id) — a group booking
// (e.g. a mother + daughter booked together) pays online as a single
// charge, not one per person. Only exists for the "payer en ligne" choice
// at booking — the alternative ("payer sur place") never creates a row
// here at all, see Reservation.paid_on_site instead. `pending` until
// Stripe confirms the checkout session via webhook; never trust the
// client-side redirect alone.
@Entity('payments')
@Index(['group_id'])
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  group_id: string;

  // The full amount charged online at booking time.
  @Column()
  amount_cents: number;

  @Column({ type: 'text', nullable: true })
  stripe_checkout_session_id: string | null;

  @Column({ type: 'text', nullable: true })
  stripe_payment_intent_id: string | null;

  @Column({ default: 'pending' })
  status: PaymentStatus;

  @Column({ type: 'int', nullable: true })
  refunded_amount_cents: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  // Set when the checkout completed and the hold was placed (status
  // 'authorized'). Stripe auto-releases an uncaptured authorization after
  // 7 days — a stale authorized_at is the signal that capture will fail.
  @Column({ type: 'timestamptz', nullable: true })
  authorized_at: Date | null;

  // Set only once the amount is actually captured (status 'paid').
  @Column({ type: 'timestamptz', nullable: true })
  paid_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  refunded_at: Date | null;
}
