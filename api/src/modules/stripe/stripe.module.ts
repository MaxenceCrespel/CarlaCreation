import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';
import { WebhookController } from './webhook.controller';

@Module({
  controllers: [WebhookController],
  providers: [StripeService, PaymentsService],
  exports: [StripeService, PaymentsService],
})
export class StripeModule {}
