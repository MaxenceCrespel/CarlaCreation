import { Test, TestingModule } from '@nestjs/testing';
import { StripeService } from './stripe.service';

describe('StripeService', () => {
  let service: StripeService;

  beforeEach(async () => {
    // No STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET in the test environment —
    // config.STRIPE_ENABLED is false, same as any deployment with no keys
    // configured. That's exactly the case this service exists to degrade
    // gracefully for.
    const module: TestingModule = await Test.createTestingModule({
      providers: [StripeService],
    }).compile();

    service = module.get(StripeService);
  });

  it('reports itself disabled when no Stripe keys are configured', () => {
    expect(service.isEnabled()).toBe(false);
  });

  it('createCheckoutSession returns null instead of calling Stripe when disabled', async () => {
    const result = await service.createCheckoutSession({
      groupId: 'group-1',
      amountCents: 1000,
      description: 'Réservation',
      customerEmail: 'client@example.com',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    });

    expect(result).toBeNull();
  });

  it('createRefund returns null instead of calling Stripe when disabled', async () => {
    await expect(service.createRefund('pi_123')).resolves.toBeNull();
  });

  it('capturePaymentIntent returns null instead of calling Stripe when disabled', async () => {
    await expect(service.capturePaymentIntent('pi_123')).resolves.toBeNull();
  });

  it('cancelPaymentIntent returns null instead of calling Stripe when disabled', async () => {
    await expect(service.cancelPaymentIntent('pi_123')).resolves.toBeNull();
  });

  it('constructWebhookEvent throws clearly when disabled, rather than reaching for a null client', () => {
    expect(() => service.constructWebhookEvent(Buffer.from('{}'), 'sig')).toThrow('Stripe is not configured.');
  });
});
