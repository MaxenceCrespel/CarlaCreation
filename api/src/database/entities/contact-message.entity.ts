import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('contact_messages')
export class ContactMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  email: string;

  @Column()
  message: string;

  @Column({ default: false })
  is_read: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
