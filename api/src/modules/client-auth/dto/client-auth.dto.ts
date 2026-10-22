import { IsDateString, IsEmail, IsInt, IsOptional, IsString, Length } from 'class-validator';

export class SignupDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsEmail()
  @Length(1, 200)
  email!: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  phone?: string;

  // Same 10-character minimum as the admin account, for consistency.
  @IsString()
  @Length(10, 200)
  password!: string;

  @IsOptional()
  @IsDateString()
  birthdate?: string;

  // A sponsor's code (see Client.referral_code). Optional.
  @IsOptional()
  @IsString()
  @Length(0, 20)
  referralCode?: string;
}

export class RedeemRewardDto {
  @IsInt()
  points!: number;
}

export class ClientLoginDto {
  @IsEmail()
  @Length(1, 200)
  email!: string;

  @IsString()
  @Length(1, 200)
  password!: string;
}

export class UpdateClientProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  phone?: string;

  @IsOptional()
  @IsDateString()
  birthdate?: string;

  // Required to set a new one, same rationale as the admin account's
  // updateCredentials — a stolen/left-open session shouldn't be enough on
  // its own to lock the real client out.
  @IsOptional()
  @IsString()
  @Length(1, 200)
  currentPassword?: string;

  @IsOptional()
  @IsString()
  @Length(10, 200)
  newPassword?: string;
}
