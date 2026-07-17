import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

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
}
