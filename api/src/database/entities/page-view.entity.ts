import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type TrafficSource = 'search' | 'direct' | 'social' | 'other';
export type DeviceType = 'mobile' | 'desktop' | 'tablet';

// One row per public-page view, for the admin's own "Visiteurs" dashboard.
// No personal data: `visitor_id` is a random id from a first-party,
// audience-measurement-only cookie (see track.controller.ts) — never an
// email, IP, or raw user agent.
@Entity('page_views')
@Index(['created_at'])
@Index(['visitor_id', 'created_at'])
export class PageView {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  path: string;

  @Column()
  visitor_id: string;

  @Column()
  source: TrafficSource;

  @Column()
  device: DeviceType;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
