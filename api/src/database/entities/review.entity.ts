import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

// Client-submitted reviews. Anyone can submit one (public form on the
// homepage); it stays 'pending' until an admin approves or rejects it. Only
// 'approved' reviews count towards the public average rating.
@Entity('reviews')
@Index(['status'])
export class Review {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  client_name: string;

  @Column()
  rating: number;

  @Column()
  comment: string;

  @Column({ default: 'pending' })
  status: ReviewStatus;

  // Public reply from the admin, shown under the review alongside the
  // client's comment. Null means no reply has been posted yet.
  @Column({ type: 'text', nullable: true })
  admin_reply: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
