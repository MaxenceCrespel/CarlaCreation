import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Column/property names deliberately stay snake_case (not idiomatic
// TypeORM/TS camelCase) so JSON responses stay byte-identical to the
// previous raw-SQL implementation — the frontend reads fields like
// `duration_minutes`/`price_cents` directly, and changing that is out of
// scope for this migration.
@Entity('services')
export class Service {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ default: '' })
  description: string;

  // References ServiceCategory — no @ManyToOne relation is declared since
  // every consumer already works with plain ids/joins (same pattern as the
  // rest of this codebase, which favours explicit queries over ORM graphs).
  @Column()
  category_id: number;

  @Column()
  duration_minutes: number;

  @Column()
  price_cents: number;

  @Column({ default: true })
  active: boolean;
}
