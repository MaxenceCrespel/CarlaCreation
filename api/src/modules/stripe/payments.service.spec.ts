import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';
import { Payment } from '../../database/entities/payment.entity';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let repo: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock };
  let stripeService: { createRefund: jest.Mock; capturePaymentIntent: jest.Mock; cancelPaymentIntent: jest.Mock };

  beforeEach(async () => {
    repo = { create: jest.fn((v) => v), save: jest.fn((v) => Promise.resolve(v)), findOne: jest.fn() };
    stripeService = { createRefund: jest.fn(), capturePaymentIntent: jest.fn(), cancelPaymentIntent: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getRepositoryToken(Payment), useValue: repo },
        { provide: StripeService, useValue: stripeService },
      ],
    }).compile();

    service = module.get(PaymentsService);
  });

  it('createPending saves a new row with pending status', async () => {
    await service.createPending('group-1', 3000, 'cs_123');

    expect(repo.create).toHaveBeenCalledWith({
      group_id: 'group-1',
      amount_cents: 3000,
      stripe_checkout_session_id: 'cs_123',
      status: 'pending',
    });
    expect(repo.save).toHaveBeenCalled();
  });

  describe('markAuthorized', () => {
    it('marks a pending payment as authorized', async () => {
      const payment = { id: 1, status: 'pending', stripe_checkout_session_id: 'cs_123' };
      repo.findOne.mockResolvedValue(payment);

      await service.markAuthorized('cs_123', 'pi_123');

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'authorized', stripe_payment_intent_id: 'pi_123', authorized_at: expect.any(Date) }),
      );
    });

    it('is a no-op for an unknown checkout session (e.g. a stale/forged webhook)', async () => {
      repo.findOne.mockResolvedValue(null);

      await service.markAuthorized('cs_unknown', 'pi_123');

      expect(repo.save).not.toHaveBeenCalled();
    });

    it('is idempotent — a redelivered webhook for an already-authorized session does nothing', async () => {
      repo.findOne.mockResolvedValue({ id: 1, status: 'authorized', stripe_checkout_session_id: 'cs_123' });

      await service.markAuthorized('cs_123', 'pi_123');

      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('capture', () => {
    it('captures an authorized payment and marks it paid', async () => {
      const payment = { id: 1, status: 'authorized', stripe_payment_intent_id: 'pi_123' };
      repo.findOne.mockResolvedValue(payment);

      await service.capture('group-1');

      expect(stripeService.capturePaymentIntent).toHaveBeenCalledWith('pi_123');
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid', paid_at: expect.any(Date) }));
    });

    it('does nothing for a payment that is not authorized', async () => {
      repo.findOne.mockResolvedValue({ id: 1, status: 'pending', stripe_payment_intent_id: null });

      await service.capture('group-1');

      expect(stripeService.capturePaymentIntent).not.toHaveBeenCalled();
    });

    it('does nothing for a group with no payment', async () => {
      repo.findOne.mockResolvedValue(null);

      await service.capture('group-1');

      expect(stripeService.capturePaymentIntent).not.toHaveBeenCalled();
    });

    it('propagates a Stripe failure instead of silently marking it paid (e.g. the 7-day hold expired)', async () => {
      repo.findOne.mockResolvedValue({ id: 1, status: 'authorized', stripe_payment_intent_id: 'pi_123' });
      stripeService.capturePaymentIntent.mockRejectedValue(new Error('The payment intent could not be captured'));

      await expect(service.capture('group-1')).rejects.toThrow('The payment intent could not be captured');
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('cancelAuthorization', () => {
    it('releases an authorized hold and marks it canceled', async () => {
      const payment = { id: 1, status: 'authorized', stripe_payment_intent_id: 'pi_123' };
      repo.findOne.mockResolvedValue(payment);

      await service.cancelAuthorization('group-1');

      expect(stripeService.cancelPaymentIntent).toHaveBeenCalledWith('pi_123');
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'canceled' }));
    });

    it('falls back to a real refund when the payment was already captured', async () => {
      const payment = { id: 1, status: 'paid', amount_cents: 3000, stripe_payment_intent_id: 'pi_123' };
      repo.findOne.mockResolvedValue(payment);

      await service.cancelAuthorization('group-1');

      expect(stripeService.createRefund).toHaveBeenCalledWith('pi_123');
      expect(stripeService.cancelPaymentIntent).not.toHaveBeenCalled();
    });

    it('does nothing for a group with no payment', async () => {
      repo.findOne.mockResolvedValue(null);

      await service.cancelAuthorization('group-1');

      expect(stripeService.cancelPaymentIntent).not.toHaveBeenCalled();
    });

    it('does nothing for a payment that was only pending (never reached checkout)', async () => {
      repo.findOne.mockResolvedValue({ id: 1, status: 'pending', stripe_payment_intent_id: null });

      await service.cancelAuthorization('group-1');

      expect(stripeService.cancelPaymentIntent).not.toHaveBeenCalled();
    });
  });

  describe('refund', () => {
    it('refunds a paid payment via Stripe and marks it refunded', async () => {
      const payment = { id: 1, status: 'paid', amount_cents: 3000, stripe_payment_intent_id: 'pi_123' };
      repo.findOne.mockResolvedValue(payment);

      await service.refund('group-1');

      expect(stripeService.createRefund).toHaveBeenCalledWith('pi_123');
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'refunded', refunded_amount_cents: 3000, refunded_at: expect.any(Date) }),
      );
    });

    it('does nothing for a group with no payment', async () => {
      repo.findOne.mockResolvedValue(null);

      await service.refund('group-1');

      expect(stripeService.createRefund).not.toHaveBeenCalled();
    });

    it('does nothing for a payment that was never actually paid', async () => {
      repo.findOne.mockResolvedValue({ id: 1, status: 'pending', stripe_payment_intent_id: null });

      await service.refund('group-1');

      expect(stripeService.createRefund).not.toHaveBeenCalled();
    });

    it('propagates a Stripe failure instead of silently marking it refunded', async () => {
      repo.findOne.mockResolvedValue({ id: 1, status: 'paid', amount_cents: 3000, stripe_payment_intent_id: 'pi_123' });
      stripeService.createRefund.mockRejectedValue(new Error('Stripe is down'));

      await expect(service.refund('group-1')).rejects.toThrow('Stripe is down');
      expect(repo.save).not.toHaveBeenCalled();
    });
  });
});
