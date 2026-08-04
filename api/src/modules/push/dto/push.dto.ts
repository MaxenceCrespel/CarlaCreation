import { IsObject, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// Mirrors the shape of a browser PushSubscription.toJSON() — keys nested
// under `keys` is the standard Web Push format, not something we chose.
class SubscriptionKeysDto {
  @IsString()
  p256dh!: string;

  @IsString()
  auth!: string;
}

export class SubscribePushDto {
  @IsString()
  endpoint!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => SubscriptionKeysDto)
  keys!: SubscriptionKeysDto;
}

export class UnsubscribePushDto {
  @IsString()
  endpoint!: string;
}
