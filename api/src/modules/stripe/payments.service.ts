import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Payment } from '../../database/entities/payment.entity';
import { StripeService } from './stripe.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    private readonly stripeService: StripeService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  findByGroupId(groupId: string): Promise<Payment | null> {
    return this.paymentRepo.findOne({ where: { group_id: groupId } });
  }

  async createPending(groupId: string, amountCents: number, stripeCheckoutSessionId: string): Promise<Payment> {
    const payment = this.paymentRepo.create({
      group_id: groupId,
      amount_cents: amountCents,
      stripe_checkout_session_id: stripeCheckoutSessionId,
      status: 'pending',
    });
    return this.paymentRepo.save(payment);
  }

  // Idempotent: Stripe can and does redeliver the same webhook event, and
  // a client can also land back on the success page and re-trigger a
  // status check — neither should double-process an already-authorized
  // row. This only records the hold — the actual charge happens later, on
  // confirmation, see `capture`.
  async markAuthorized(stripeCheckoutSessionId: string, stripePaymentIntentId: string): Promise<void> {
    const payment = await this.paymentRepo.findOne({ where: { stripe_checkout_session_id: stripeCheckoutSessionId } });
    if (!payment || payment.status !== 'pending') return;

    payment.status = 'authorized';
    payment.stripe_payment_intent_id = stripePaymentIntentId;
    payment.authorized_at = new Date();
    await this.paymentRepo.save(payment);

    // The client can finish paying after the booking was cancelled, refused
    // or deleted (checkout left open in another tab): nobody will ever settle
    // that hold, so release it right away.
    const rows: { status: string }[] = await this.dataSource.query(`SELECT DISTINCT status FROM reservations WHERE group_id = $1`, [payment.group_id]);
    const stillLive = rows.some((r) => r.status !== 'cancelled' && r.status !== 'refused');
    if (!stillLive) {
      try {
        await this.cancelAuthorization(payment.group_id);
      } catch {
        // Already logged by cancelAuthorization.
      }
    }
  }

  // Stripe can fail to deliver (or we can miss) the checkout.session.completed
  // webhook: before treating a payment as "never paid", ask Stripe directly.
  async syncPending(groupId: string): Promise<void> {
    const payment = await this.paymentRepo.findOne({ where: { group_id: groupId } });
    if (!payment || payment.status !== 'pending' || !payment.stripe_checkout_session_id) return;

    try {
      const session = await this.stripeService.retrieveCheckoutSession(payment.stripe_checkout_session_id);
      const paymentIntentId = typeof session?.payment_intent === 'string' ? session.payment_intent : session?.payment_intent?.id;
      if (session?.status === 'complete' && paymentIntentId) {
        await this.markAuthorized(session.id, paymentIntentId);
      }
    } catch (err) {
      this.logger.error(`Stripe session sync failed for group ${groupId}: ${(err as Error).message}`);
    }
  }

  // The client never completed checkout (or the booking was cancelled before
  // they did): close the session so they can't pay for it afterwards.
  async markAbandoned(groupId: string): Promise<void> {
    const payment = await this.paymentRepo.findOne({ where: { group_id: groupId } });
    if (!payment || payment.status !== 'pending') return;

    if (payment.stripe_checkout_session_id) {
      try {
        await this.stripeService.expireCheckoutSession(payment.stripe_checkout_session_id);
      } catch (err) {
        // Most likely already expired or completed — the status below is what matters.
        this.logger.warn(`Stripe session expire failed for group ${groupId}: ${(err as Error).message}`);
      }
    }
    payment.status = 'canceled';
    await this.paymentRepo.save(payment);
  }

  // Called when Carla confirms the appointment (see ReservationsService.
  // settlePaymentForGroupStatus) — turns the hold placed at checkout into
  // an actual charge. A failed capture (most likely: the 7-day
  // authorization window expired before she got to it) must not block the
  // confirmation itself — surfaced in logs for her to chase up by hand.
  // Resolves 'captured' once the money moved, 'unpaid' when the client never
  // completed checkout (so there is nothing to capture and the admin must
  // know), 'skipped' when there is nothing to do (no online payment, or
  // already paid).
  async capture(groupId: string): Promise<'captured' | 'unpaid' | 'skipped'> {
    let payment = await this.paymentRepo.findOne({ where: { group_id: groupId } });
    if (payment?.status === 'pending') {
      await this.syncPending(groupId);
      payment = await this.paymentRepo.findOne({ where: { group_id: groupId } });
    }
    if (!payment) return 'skipped';
    if (payment.status === 'pending' || payment.status === 'canceled') return 'unpaid';
    if (payment.status !== 'authorized' || !payment.stripe_payment_intent_id) return 'skipped';

    try {
      await this.stripeService.capturePaymentIntent(payment.stripe_payment_intent_id);
      payment.status = 'paid';
      payment.paid_at = new Date();
      await this.paymentRepo.save(payment);
      return 'captured';
    } catch (err) {
      this.logger.error(`Capture failed for group ${groupId}: ${(err as Error).message}`);
      throw err;
    }
  }

  // Called when Carla refuses a request that was never confirmed — releases
  // the hold without ever charging the card, so there's nothing to refund.
  // Falls back to a real refund for the rare case the payment was somehow
  // already captured (e.g. confirmed, then refused after the fact).
  async cancelAuthorization(groupId: string): Promise<void> {
    const payment = await this.paymentRepo.findOne({ where: { group_id: groupId } });
    if (payment?.status === 'pending') {
      await this.markAbandoned(groupId);
      return;
    }
    if (!payment || !payment.stripe_payment_intent_id) return;

    if (payment.status === 'paid') {
      await this.refund(groupId);
      return;
    }
    if (payment.status !== 'authorized') return;

    try {
      await this.stripeService.cancelPaymentIntent(payment.stripe_payment_intent_id);
      payment.status = 'canceled';
      await this.paymentRepo.save(payment);
    } catch (err) {
      this.logger.error(`Authorization cancel failed for group ${groupId}: ${(err as Error).message}`);
      throw err;
    }
  }

  // Called from ReservationsService.cancelByGroupId — refund eligibility
  // (how far in advance the client cancelled) is that method's concern,
  // not this one's; by the time this runs, the caller has already decided
  // a refund is owed.
  async refund(groupId: string): Promise<void> {
    const payment = await this.paymentRepo.findOne({ where: { group_id: groupId } });
    if (!payment || payment.status !== 'paid' || !payment.stripe_payment_intent_id) return;

    try {
      await this.stripeService.createRefund(payment.stripe_payment_intent_id);
      payment.status = 'refunded';
      payment.refunded_amount_cents = payment.amount_cents;
      payment.refunded_at = new Date();
      await this.paymentRepo.save(payment);
    } catch (err) {
      // A failed refund must not block the cancellation itself going
      // through — surface it in logs so it can be handled by hand (Stripe
      // dashboard) rather than silently losing the client's money.
      this.logger.error(`Refund failed for group ${groupId}: ${(err as Error).message}`);
      throw err;
    }
  }
}
