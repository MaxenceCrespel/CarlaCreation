import { IsEmail, IsEmpty, IsString, Length } from 'class-validator';

export class CreateContactDto {
  @IsString()
  @Length(2, 100)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(5, 2000)
  message!: string;

  // Honeypot: must stay empty. Bots that auto-fill every field trip this.
  @IsEmpty({ message: 'Requête invalide.' })
  website?: string;
}
