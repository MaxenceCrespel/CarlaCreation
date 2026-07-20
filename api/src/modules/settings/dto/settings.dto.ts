import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, Matches, Max, Min, ValidateNested } from 'class-validator';

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
