import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// A logged business expense (stock purchase, loyer, matériel...) — the
// simple counterpart to Invoice on the revenue side. Free-text category
// (like Product.unit) rather than an enum: the range of expense types is
// too varied to fix up front, and the dashboard just groups by whatever
// string was typed.
@Entity('expenses')
export class Expense {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  @Index()
  expense_date: string;

  @Column({ default: 'Autre' })
  category: string;

  @Column({ default: '' })
  description: string;

  @Column({ type: 'int' })
  amount_cents: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
