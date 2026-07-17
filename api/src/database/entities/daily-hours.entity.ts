import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { DailyHoursRange } from './daily-hours-range.entity';

// Per-date hours. There is no recurring weekly pattern: a date with no row
// here is closed. The admin explicitly opens each date (day by day).
@Entity('daily_hours')
export class DailyHours {
  @PrimaryColumn({ type: 'text' })
  date: string;

  @Column({ default: false })
  is_closed: boolean;

  @OneToMany(() => DailyHoursRange, (range) => range.dailyHours)
  ranges: DailyHoursRange[];
}
