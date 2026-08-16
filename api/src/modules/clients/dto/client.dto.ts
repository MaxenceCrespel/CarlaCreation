import { IsInt, IsOptional, IsString, Length } from 'class-validator';

export class CreateClientDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  email?: string;

  @IsOptional()
  @IsString()
  @Length(0, 5000)
  notes?: string;
}

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  email?: string;

  @IsOptional()
  @IsString()
  @Length(0, 5000)
  notes?: string;
}

export class CreateAndLinkClientDto extends CreateClientDto {
  @IsInt()
  reservationId!: number;
}

export class LinkClientDto {
  @IsInt()
  reservationId!: number;

  @IsInt()
  clientId!: number;
}

export class UnlinkClientDto {
  @IsInt()
  reservationId!: number;
}
