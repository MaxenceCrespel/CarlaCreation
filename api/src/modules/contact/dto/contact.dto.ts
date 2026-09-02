import { IsBoolean, IsEmpty, IsString, Length, Matches } from 'class-validator';

export class CreateContactDto {
  @IsString()
  @Length(2, 100)
  name!: string;

  @IsString()
  @Matches(/^[0-9+\s().-]{6,20}$/)
  phone!: string;

  @IsString()
  @Length(5, 2000)
  message!: string;

  // Honeypot: must stay empty. Bots that auto-fill every field trip this.
  @IsEmpty({ message: 'Requête invalide.' })
  website?: string;
}

export class UpdateContactMessageDto {
  @IsBoolean()
  isRead!: boolean;
}
