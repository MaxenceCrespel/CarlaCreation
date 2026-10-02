import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { config } from '../../config';

export interface CreateCheckoutSessionParams {
  groupId: string;
  amountCents: number;
  description: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

// Thin wrapper around the Stripe SDK — every call is a no-op (or throws
// clearly) when config.STRIPE_ENABLED is false, same "entirely optional"
// pattern as PushService/geocoding elsewhere in this app. Never called
// directly by controllers: ReservationsService/PaymentsService decide
// *whether* to charge at all (STRIPE_ENABLED), this just talks to Stripe
// once asked.
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly client: Stripe | null;

  constructor() {
    this.client = config.STRIPE_ENABLED ? new Stripe(config.STRIPE_SECRET_KEY) : null;
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  // capture_method: 'manual' — the card is authorized (funds held) but not
  // actually charged at checkout. Carla only captures it once she confirms
  // the appointment (see PaymentsService.capture); refusing a request just
  // releases the hold (cancelAuthorization), no refund ever needed for a
  // request she turns down. Note: Stripe auto-releases an uncaptured
  // authorization after 7 days, so a confirm/refuse decision made later
  // than that will fail to capture and needs a fresh payment from the
  // client.
  async createCheckoutSession(params: CreateCheckoutSessionParams): Promise<{ url: string; sessionId: string } | null> {
    if (!this.client) return null;

    const session = await this.client.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: params.customerEmail,
      customer_creation: 'always',
      payment_intent_data: { capture_method: 'manual' },
      line_items: [
        {
          price_data: {
            currency: 'eur',
            unit_amount: params.amountCents,
            product_data: { name: params.description },
          },
          quantity: 1,
        },
      ],
      metadata: { groupId: params.groupId },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    });

    if (!session.url) {
      // Shouldn't happen for a freshly-created 'payment' mode session, but
      // the type is nullable — fail loudly rather than send the client
      // nowhere.
      this.logger.error(`Stripe Checkout session ${session.id} was created without a url`);
      return null;
    }

    return { url: session.url, sessionId: session.id };
  }

  // Raw body (a Buffer, not the parsed JSON) is mandatory here — signature
  // verification hashes the exact bytes Stripe sent. See main.ts's
  // `rawBody: true` and webhook.controller.ts's use of `req.rawBody`.
  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    if (!this.client) {
      throw new Error('Stripe is not configured.');
    }
    return this.client.webhooks.constructEvent(rawBody, signature, config.STRIPE_WEBHOOK_SECRET);
  }

  async createRefund(paymentIntentId: string, amountCents?: number): Promise<Stripe.Refund | null> {
    if (!this.client) return null;
    return this.client.refunds.create({ payment_intent: paymentIntentId, amount: amountCents });
  }

  // Turns the hold placed at checkout into an actual charge — called when
  // Carla confirms the appointment (see PaymentsService.capture).
  async capturePaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent | null> {
    if (!this.client) return null;
    return this.client.paymentIntents.capture(paymentIntentId);
  }

  // Releases a hold without ever charging the card — called when Carla
  // refuses a request that was never confirmed (see
  // PaymentsService.cancelAuthorization). No refund involved: nothing was
  // captured in the first place.
  async cancelPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent | null> {
    if (!this.client) return null;
    return this.client.paymentIntents.cancel(paymentIntentId);
  }
}
