import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('gallery')
export class Gallery {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  url: string;

  // Optional "before" photo — when set, `url` is shown as the "after" side
  // of a before/after comparison slider. Null for regular single-photo
  // entries.
  @Column({ type: 'text', nullable: true })
  before_url: string | null;

  @Column({ default: '' })
  alt_text: string;

  @Column({ default: 0 })
  sort_order: number;

  @Column({ default: false })
  is_upload: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
