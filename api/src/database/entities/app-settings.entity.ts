import { Column, Entity, PrimaryColumn } from 'typeorm';

// Single-row table (id is always 1) for the handful of admin-editable
// global settings that don't belong anywhere else — currently the
// à-domicile travel buffer and the fuel surcharge fallback (see
// TravelFeeTier for the actual distance-based fee schedule; this fallback
// only applies when the client's distance couldn't be determined at all).
@Entity('app_settings')
export class AppSettings {
  @PrimaryColumn({ default: 1 })
  id: number;

  @Column({ default: 30 })
  travel_buffer_minutes: number;

  @Column({ default: 200 })
  travel_fee_fallback_cents: number;

  // How far in advance (relative to the appointment's start time) a client
  // must cancel for their online payment to be refunded — see
  // ReservationsService.cancelByGroupId. Only applies to the "payer en
  // ligne" choice (see Payment); "payer sur place" never involves Stripe.
  @Column({ default: 48 })
  refund_deadline_hours: number;

  @Column({ default: 10 })
  birthday_discount_percent: number;
}
