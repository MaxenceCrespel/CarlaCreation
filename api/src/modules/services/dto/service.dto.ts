import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, Min, ValidateNested } from 'class-validator';

// A supplement is always scoped to the service it's being saved on (e.g.
// "Nail art" only makes sense attached to "Manucure Classique") — the whole
// list is replaced wholesale on every create/update, same pattern as daily
// hours ranges (simpler than a diff, and the list is always short).
export class ServiceAddonDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsInt()
  @Min(0)
  @Max(100000)
  extraPriceCents!: number;

  @IsInt()
  @Min(0)
  @Max(240)
  extraDurationMinutes!: number;
}

export class CreateServiceDto {
  @IsString()
  @Length(2, 100)
  name!: string;

  @IsString()
  @Length(0, 500)
  description!: string;

  @IsIn(['coiffure', 'ongles'])
  category!: 'coiffure' | 'ongles';

  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes!: number;

  @IsInt()
  @Min(0)
  @Max(100000)
  priceCents!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ServiceAddonDto)
  addons?: ServiceAddonDto[];
}

export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsIn(['coiffure', 'ongles'])
  category?: 'coiffure' | 'ongles';

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  priceCents?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ServiceAddonDto)
  addons?: ServiceAddonDto[];
}
