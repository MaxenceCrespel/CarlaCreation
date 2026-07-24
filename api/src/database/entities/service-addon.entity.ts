import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// An optional extra a client can add to a specific prestation (e.g. "Nail
// art" on top of "Manucure Classique") — adds to both price and duration.
// Always scoped to one service_id, never a global catalog (see ServicesTab).
@Entity('service_addons')
export class ServiceAddon {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  service_id: number;

  @Column()
  name: string;

  @Column({ default: 0 })
  extra_price_cents: number;

  @Column({ default: 0 })
  extra_duration_minutes: number;

  @Column({ default: true })
  active: boolean;
}
