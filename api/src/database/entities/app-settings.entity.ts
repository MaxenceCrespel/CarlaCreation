import { Column, Entity, PrimaryColumn } from 'typeorm';

// Single-row table (id is always 1) for the handful of admin-editable
// global settings that don't belong anywhere else — currently just the
// à-domicile travel buffer.
@Entity('app_settings')
export class AppSettings {
  @PrimaryColumn({ default: 1 })
  id: number;

  @Column({ default: 30 })
  travel_buffer_minutes: number;
}
