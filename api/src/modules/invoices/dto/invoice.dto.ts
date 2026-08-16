import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Min, ValidateNested } from 'class-validator';

export class InvoiceItemDto {
  @IsString()
  @Length(1, 300)
  description: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  // Can be negative — a discount/promotion line is added as a negative
  // amount rather than shrinking another line's unit price, so it stays
  // visible on the invoice (see InvoicesService.draftFromReservation).
  @IsInt()
  @Min(-1_000_000)
  unitPriceCents: number;
}

export class CreateInvoiceDto {
  @IsOptional()
  @IsInt()
  reservationId?: number;

  @IsString()
  @Length(1, 200)
  clientName: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  clientEmail?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  clientPhone?: string;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  clientAddress?: string;

  @IsOptional()
  @IsString()
  issueDate?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];
}

export class UpdateInvoiceStatusDto {
  @IsIn(['unpaid', 'paid'])
  status: 'unpaid' | 'paid';

  @IsOptional()
  @IsString()
  @Length(0, 50)
  paymentMethod?: string;
}
