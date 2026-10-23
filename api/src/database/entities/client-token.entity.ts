import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type ClientTokenType = 'verify_email' | 'reset_password';

// Single-use link token (email verification, password reset). Only the
// SHA-256 of the token is stored — see AccountLifecycleService.
@Entity('client_tokens')
export class ClientToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  client_id: number;

  @Column()
  type: ClientTokenType;

  @Column({ type: 'text', unique: true })
  token_hash: string;

  @Column({ type: 'timestamptz' })
  expires_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  used_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
