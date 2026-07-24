import { Column, Entity, PrimaryColumn } from 'typeorm';

// Single-row table (id is always 1) for the handful of admin-editable
// global settings that don't belong anywhere else — currently the
// à-domicile travel buffer and the flat travel/fuel surcharge.
@Entity('app_settings')
export class AppSettings {
  @PrimaryColumn({ default: 1 })
  id: number;

  @Column({ default: 30 })
  travel_buffer_minutes: number;

  @Column({ default: 200 })
  travel_fee_cents: number;
}
