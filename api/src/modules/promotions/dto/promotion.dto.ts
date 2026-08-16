import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, Min, ValidateIf } from 'class-validator';

export class CreatePromotionDto {
  @IsString()
  @Length(1, 100)
  label!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  discountPercent!: number;

  @IsOptional()
  @IsBoolean()
  requiresCode?: boolean;

  // Required when requiresCode is true, ignored otherwise.
  @ValidateIf((o) => o.requiresCode === true)
  @IsString()
  @Length(3, 30)
  code?: string;
}

export class UpdatePromotionDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  label?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  discountPercent?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @Length(3, 30)
  code?: string;
}
