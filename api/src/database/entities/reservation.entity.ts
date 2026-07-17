import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type ReservationStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'refused';

// group_id links multiple rows created from a single booking request (e.g. a
// mother booking for herself and her daughter): one row per person/service,
// sharing the same group_id, contact info and date, with consecutive
// start/end times computed from each service's duration. NULL for solo
// bookings made before this feature existed.
@Entity('reservations')
@Index(['reservation_date'])
@Index(['group_id'])
export class Reservation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', nullable: true })
  group_id: string | null;

  @Column()
  service_id: number;

  @Column()
  client_name: string;

  @Column()
  client_email: string;

  @Column()
  client_phone: string;

  @Column({ type: 'text' })
  reservation_date: string;

  @Column({ type: 'text' })
  start_time: string;

  @Column({ type: 'text' })
  end_time: string;

  @Column({ default: '' })
  notes: string;

  @Column({ default: 'pending' })
  status: ReservationStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
