import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webpush from 'web-push';
import { config } from '../../config';
import { PushSubscription } from '../../database/entities/push-subscription.entity';
import { SubscribePushDto } from './dto/push.dto';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(@InjectRepository(PushSubscription) private readonly subRepo: Repository<PushSubscription>) {
    if (config.PUSH_ENABLED) {
      webpush.setVapidDetails(config.VAPID_SUBJECT, config.VAPID_PUBLIC_KEY, config.VAPID_PRIVATE_KEY);
    }
  }

  getPublicKey(): string | null {
    return config.PUSH_ENABLED ? config.VAPID_PUBLIC_KEY : null;
  }

  // Upsert by endpoint: the same device re-subscribing (e.g. after clearing
  // site data) naturally gets a new endpoint from the browser, but a
  // reload/duplicate call with an unchanged endpoint should just refresh
  // the keys in place rather than erroring on the unique constraint.
  async subscribe(adminId: number, dto: SubscribePushDto): Promise<void> {
    await this.subRepo
      .createQueryBuilder()
      .insert()
      .values({ admin_id: adminId, endpoint: dto.endpoint, p256dh: dto.keys.p256dh, auth: dto.keys.auth })
      .orUpdate(['p256dh', 'auth', 'admin_id'], ['endpoint'])
      .execute();
  }

  async unsubscribe(adminId: number, endpoint: string): Promise<void> {
    await this.subRepo.delete({ admin_id: adminId, endpoint });
  }

  async isSubscribed(adminId: number, endpoint: string): Promise<boolean> {
    const row = await this.subRepo.findOne({ where: { admin_id: adminId, endpoint } });
    return Boolean(row);
  }

  // Fans out to every admin device that's enabled notifications (typically
  // just Carla's phone, but nothing stops her adding a second device). A
  // failed push must never break whatever triggered it (e.g. a new booking
  // still needs to save/email regardless) — errors are swallowed here,
  // same rationale as MailService.send. 404/410 means the browser's push
  // service considers the subscription dead (uninstalled, permissions
  // revoked, expired) — clean those up instead of retrying forever.
  async notifyAdmins(payload: PushPayload): Promise<void> {
    if (!config.PUSH_ENABLED) return;

    const subscriptions = await this.subRepo.find();
    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload),
          );
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await this.subRepo.delete({ id: sub.id });
          } else {
            this.logger.warn(`Push notification failed for subscription ${sub.id}: ${(err as Error).message}`);
          }
        }
      }),
    );
  }
}
