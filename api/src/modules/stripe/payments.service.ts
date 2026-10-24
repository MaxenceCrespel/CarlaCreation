import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '../../database/entities/payment.entity';
import { StripeService } from './stripe.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    private readonly stripeService: StripeService,
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
  }

  // Called when Carla confirms the appointment (see ReservationsService.
  // settlePaymentForGroupStatus) — turns the hold placed at checkout into
  // an actual charge. A failed capture (most likely: the 7-day
  // authorization window expired before she got to it) must not block the
  // confirmation itself — surfaced in logs for her to chase up by hand.
  async capture(groupId: string): Promise<void> {
    const payment = await this.paymentRepo.findOne({ where: { group_id: groupId } });
    if (!payment || payment.status !== 'authorized' || !payment.stripe_payment_intent_id) return;

    try {
      await this.stripeService.capturePaymentIntent(payment.stripe_payment_intent_id);
      payment.status = 'paid';
      payment.paid_at = new Date();
      await this.paymentRepo.save(payment);
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
