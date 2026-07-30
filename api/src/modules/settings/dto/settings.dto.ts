import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsNumber, IsOptional, Matches, Max, Min, ValidateNested } from 'class-validator';

export class TimeRangeDto {
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  openTime!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  closeTime!: string;
}

export class UpdateDailyHoursDto {
  @IsBoolean()
  isClosed!: boolean;

  // One or more open windows for the day (e.g. 10:00–13:00 and
  // 16:00–19:00 for a lunch break). Ignored/empty when isClosed is true.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => TimeRangeDto)
  ranges?: TimeRangeDto[];
}

export class UpdateTravelBufferDto {
  @IsInt()
  @Min(0)
  @Max(240)
  minutes!: number;
}

export class UpdateTravelFeeFallbackDto {
  @IsInt()
  @Min(0)
  @Max(10000)
  feeCents!: number;
}

export class TravelFeeTierDto {
  @IsNumber()
  @Min(0)
  @Max(500)
  minKm!: number;

  @IsInt()
  @Min(0)
  @Max(10000)
  feeCents!: number;
}

export class UpdateTravelFeeTiersDto {
  // Replaces the whole schedule at once — simpler to reason about (and to
  // validate as a set: unique thresholds, one starting at 0) than diffing
  // individual tier edits.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => TravelFeeTierDto)
  tiers!: TravelFeeTierDto[];
}
