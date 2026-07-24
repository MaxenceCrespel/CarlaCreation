import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEmpty,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class AvailabilityQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  // Comma-separated list, e.g. "?serviceIds=1,3" — one entry per person
  // being booked together, so availability reflects the combined duration.
  @Transform(({ value }) => String(value).split(',').map((v: string) => Number(v.trim())))
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(1, { each: true })
  serviceIds!: number[];

  // "true"/"false" query string — à-domicile bookings need extra travel
  // buffer factored into availability, see getAvailableSlots.
  // Global ValidationPipe has enableImplicitConversion on, which coerces
  // ANY non-empty query string (including "false") to boolean `true`
  // before a @Transform keyed on `value` ever sees it — so read the raw,
  // un-coerced value straight off `obj` instead.
  @IsOptional()
  @Transform(({ obj }) => obj.atClientHome === true || obj.atClientHome === 'true')
  @IsBoolean()
  atClientHome?: boolean;

  // Total extra minutes from every addon selected across every guest (not
  // per-guest/per-addon detail — duration is additive regardless of which
  // addons, so a single total is enough to keep the query string simple).
  // Actual addon validity is only re-checked where it matters, at booking
  // creation time.
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  addonMinutes?: number;
}

export class NextAvailableQueryDto {
  // Comma-separated list, same convention as AvailabilityQueryDto.
  @Transform(({ value }) => String(value).split(',').map((v: string) => Number(v.trim())))
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(1, { each: true })
  serviceIds!: number[];

  // Global ValidationPipe has enableImplicitConversion on, which coerces
  // ANY non-empty query string (including "false") to boolean `true`
  // before a @Transform keyed on `value` ever sees it — so read the raw,
  // un-coerced value straight off `obj` instead.
  @IsOptional()
  @Transform(({ obj }) => obj.atClientHome === true || obj.atClientHome === 'true')
  @IsBoolean()
  atClientHome?: boolean;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  addonMinutes?: number;
}

// A person booked alongside the primary contact (e.g. a mother booking for
// herself and her daughter): the daughter is an "additional guest" with her
// own name and service, back-to-back with the others in the same request.
export class AdditionalGuestDto {
  @IsString()
  @Length(2, 100)
  name!: string;

  @IsInt()
  @Min(1)
  serviceId!: number;

  // Ids of ServiceAddon rows for THIS guest's service (e.g. "Nail Art" on
  // top of their "Manucure Classique") — validated against that specific
  // service in ReservationsService, not just "any addon exists".
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  @Min(1, { each: true })
  addonIds?: number[];
}

export class CreateReservationDto {
  @IsInt()
  @Min(1)
  serviceId!: number;

  @IsString()
  @Length(2, 100)
  clientName!: string;

  @IsEmail()
  clientEmail!: string;

  @IsString()
  @Matches(/^[0-9+\s().-]{6,20}$/)
  clientPhone!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;

  // Addons for the primary contact's own service (see AdditionalGuestDto).
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  @Min(1, { each: true })
  addonIds?: number[];

  // Carla is a solo auto-entrepreneuse, not a fixed salon: the client
  // either comes to her (default) or she travels to clientAddress.
  @IsOptional()
  @IsBoolean()
  atClientHome?: boolean;

  @ValidateIf((o) => o.atClientHome === true)
  @IsString()
  @Length(5, 300)
  clientAddress?: string;

  // Honeypot: must stay empty. Bots that auto-fill every field trip this.
  @IsEmpty({ message: 'Requête invalide.' })
  website?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => AdditionalGuestDto)
  additionalGuests?: AdditionalGuestDto[];
}

export class UpdateReservationStatusDto {
  @IsIn(['pending', 'confirmed', 'cancelled', 'completed', 'refused'])
  status!: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'refused';
}

// Admin editing a single existing reservation row (not the status endpoint —
// this is for fixing a mistaken date/time/service/client detail after the
// fact). Every field optional: only what's provided gets changed. Does not
// touch other rows in the same group, if any — editing a grouped booking's
// individual member can desync it from its siblings' back-to-back timing,
// which is an accepted limitation for now.
export class UpdateReservationDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  serviceId?: number;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  clientName?: string;

  @IsOptional()
  @IsEmail()
  clientEmail?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+\s().-]{6,20}$/)
  clientPhone?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  @Min(1, { each: true })
  addonIds?: number[];

  @IsOptional()
  @IsBoolean()
  atClientHome?: boolean;

  @ValidateIf((o) => o.atClientHome === true)
  @IsString()
  @Length(5, 300)
  clientAddress?: string;
}

// Used by the admin to manually log a reservation (walk-in, phone booking…).
// Unlike the public flow, this bypasses the honeypot and the "must be a
// pre-computed available slot" constraint — the admin can book any date/time
// (including a day not yet opened, or a time already past) — but still gets
// a hard overlap check against existing reservations.
export class AdminCreateReservationDto {
  @IsInt()
  @Min(1)
  serviceId!: number;

  @IsString()
  @Length(2, 100)
  clientName!: string;

  @IsEmail()
  clientEmail!: string;

  @IsString()
  @Matches(/^[0-9+\s().-]{6,20}$/)
  clientPhone!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  @Min(1, { each: true })
  addonIds?: number[];

  @IsOptional()
  @IsBoolean()
  atClientHome?: boolean;

  @ValidateIf((o) => o.atClientHome === true)
  @IsString()
  @Length(5, 300)
  clientAddress?: string;

  @IsOptional()
  @IsIn(['pending', 'confirmed', 'completed'])
  status?: 'pending' | 'confirmed' | 'completed';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => AdditionalGuestDto)
  additionalGuests?: AdditionalGuestDto[];
}
