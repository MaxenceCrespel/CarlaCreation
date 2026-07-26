import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('admins')
export class Admin {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column()
  password_hash: string;

  // Unguessable token embedded in the public .ics subscription URL (see
  // CalendarFeedController) — this doubles as that endpoint's auth, since a
  // calendar app's background refresh can't carry a session cookie. Null
  // until the admin generates it the first time from "Mon compte".
  @Column({ type: 'text', nullable: true, unique: true })
  calendar_token: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
