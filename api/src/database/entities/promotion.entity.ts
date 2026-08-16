import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// Two flavours in one table: a "tarif spécial" (requires_code = false,
// code = null) that the client picks from a dropdown at booking time, or a
// "code promo" (requires_code = true) that the client types in — see
// ReservationsService.resolvePublicPromotion for how each is validated.
// Percentage-only (no fixed-amount discounts) — matches every example
// given for this feature ("10% étudiant", a welcome code).
@Entity('promotions')
export class Promotion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  label: string;

  @Column({ type: 'int' })
  discount_percent: number;

  @Column({ default: false })
  requires_code: boolean;

  // Normalized uppercase, only set when requires_code is true.
  @Column({ type: 'text', nullable: true })
  @Index()
  code: string | null;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
