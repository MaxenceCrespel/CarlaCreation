import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateExpenseDto {
  @IsString()
  expenseDate!: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  category?: string;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  description?: string;

  @IsInt()
  @Min(1)
  amountCents!: number;
}

export class UpdateExpenseDto {
  @IsOptional()
  @IsString()
  expenseDate?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  category?: string;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  amountCents?: number;
}
