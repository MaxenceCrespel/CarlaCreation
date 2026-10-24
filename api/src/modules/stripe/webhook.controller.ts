import { BadRequestException, Controller, Headers, Logger, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';

@Controller('api/stripe')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly paymentsService: PaymentsService,
  ) {}

  // Not behind CsrfGuard/AdminAuthGuard — this is a server-to-server call
  // from Stripe, authenticated by the webhook signature instead (see
  // constructWebhookEvent). Needs the *raw* request body (main.ts's
  // `rawBody: true`), not the JSON-parsed one, for that signature check.
  @Post('webhook')
  async handleWebhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature: string) {
    if (!req.rawBody || !signature) {
      throw new BadRequestException('Missing Stripe signature or body.');
    }

    let event: Stripe.Event;
    try {
      event = this.stripeService.constructWebhookEvent(req.rawBody, signature);
    } catch (err) {
      this.logger.warn(`Stripe webhook signature verification failed: ${(err as Error).message}`);
      throw new BadRequestException('Invalid signature.');
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
      if (paymentIntentId) {
        await this.paymentsService.markAuthorized(session.id, paymentIntentId);
      }
    }

    return { received: true };
  }
}
