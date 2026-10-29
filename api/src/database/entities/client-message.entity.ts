import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type MessageSender = 'client' | 'admin';

// A message in the conversation between a client account and the salon
// (see MessagingService). `photo` is a server-generated file name under
// uploads/messages/, never served statically — only through the guarded
// photo routes. `read_at` is set when the *other* party opens the thread.
@Entity('client_messages')
export class ClientMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  client_id: number;

  @Column({ type: 'text' })
  sender: MessageSender;

  @Column({ type: 'text', default: '' })
  body: string;

  @Column({ type: 'text', nullable: true })
  photo: string | null;

  @Column({ type: 'int', nullable: true })
  reservation_id: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  read_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
