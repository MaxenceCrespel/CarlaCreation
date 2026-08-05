import { IsInt, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @Length(1, 150)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(1, 30)
  unit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lowStockThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  purchasePriceCents?: number;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 30)
  unit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lowStockThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  purchasePriceCents?: number;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}
