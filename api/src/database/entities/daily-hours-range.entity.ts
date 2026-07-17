import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { DailyHours } from './daily-hours.entity';

// A day can have more than one open range (e.g. 10:00–13:00 and 16:00–19:00
// for a lunch break) — a booking must fit entirely within a single range,
// it can never span the gap between two.
@Entity('daily_hours_ranges')
@Index(['date'])
export class DailyHoursRange {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  date: string;

  @ManyToOne(() => DailyHours, (dailyHours) => dailyHours.ranges, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'date', referencedColumnName: 'date' })
  dailyHours: DailyHours;

  @Column({ type: 'text' })
  open_time: string;

  @Column({ type: 'text' })
  close_time: string;
}
