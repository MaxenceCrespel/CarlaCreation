import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { StripeService } from './stripe.service';
import { PaymentsService } from './payments.service';

describe('WebhookController', () => {
  let controller: WebhookController;
  let stripeService: { constructWebhookEvent: jest.Mock };
  let paymentsService: { markAuthorized: jest.Mock };

  beforeEach(async () => {
    stripeService = { constructWebhookEvent: jest.fn() };
    paymentsService = { markAuthorized: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        { provide: StripeService, useValue: stripeService },
        { provide: PaymentsService, useValue: paymentsService },
      ],
    }).compile();

    controller = module.get(WebhookController);
  });

  function req(rawBody: Buffer | undefined) {
    return { rawBody } as any;
  }

  it('rejects a request with no raw body', async () => {
    await expect(controller.handleWebhook(req(undefined), 'sig')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a request with no signature header', async () => {
    await expect(controller.handleWebhook(req(Buffer.from('{}')), '')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a request with an invalid signature', async () => {
    stripeService.constructWebhookEvent.mockImplementation(() => {
      throw new Error('signature mismatch');
    });

    await expect(controller.handleWebhook(req(Buffer.from('{}')), 'bad-sig')).rejects.toBeInstanceOf(BadRequestException);
    expect(paymentsService.markAuthorized).not.toHaveBeenCalled();
  });

  it('marks the payment authorized on checkout.session.completed', async () => {
    stripeService.constructWebhookEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_123', payment_intent: 'pi_123' } },
    });

    const result = await controller.handleWebhook(req(Buffer.from('{}')), 'sig');

    expect(paymentsService.markAuthorized).toHaveBeenCalledWith('cs_123', 'pi_123');
    expect(result).toEqual({ received: true });
  });

  it('handles an expanded payment_intent object, not just a bare id string', async () => {
    stripeService.constructWebhookEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_123', payment_intent: { id: 'pi_123' } } },
    });

    await controller.handleWebhook(req(Buffer.from('{}')), 'sig');

    expect(paymentsService.markAuthorized).toHaveBeenCalledWith('cs_123', 'pi_123');
  });

  it('ignores event types it does not handle', async () => {
    stripeService.constructWebhookEvent.mockReturnValue({ type: 'payment_intent.created', data: { object: {} } });

    const result = await controller.handleWebhook(req(Buffer.from('{}')), 'sig');

    expect(paymentsService.markAuthorized).not.toHaveBeenCalled();
    expect(result).toEqual({ received: true });
  });
});
