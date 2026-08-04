import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// One row per browser/device the admin has enabled notifications on (e.g.
// phone + desktop both subscribed). endpoint is the browser's own push
// service URL — inherently unique per subscription, so it's the natural
// upsert key when the same device re-subscribes (e.g. after clearing data).
@Entity('push_subscriptions')
export class PushSubscription {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  admin_id: number;

  @Column({ type: 'text', unique: true })
  endpoint: string;

  @Column({ type: 'text' })
  p256dh: string;

  @Column({ type: 'text' })
  auth: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
