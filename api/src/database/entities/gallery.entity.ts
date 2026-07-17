import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('gallery')
export class Gallery {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  url: string;

  @Column({ default: '' })
  alt_text: string;

  @Column({ default: 0 })
  sort_order: number;

  @Column({ default: false })
  is_upload: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
