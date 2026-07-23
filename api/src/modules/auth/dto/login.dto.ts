import { IsOptional, IsString, Length } from 'class-validator';

export class LoginDto {
  @IsString()
  @Length(1, 100)
  username!: string;

  @IsString()
  @Length(1, 200)
  password!: string;
}

export class UpdateCredentialsDto {
  @IsString()
  @Length(1, 200)
  currentPassword!: string;

  @IsOptional()
  @IsString()
  @Length(3, 100)
  newUsername?: string;

  // Same 10-character minimum as scripts/seedAdmin.ts, for consistency.
  @IsOptional()
  @IsString()
  @Length(10, 200)
  newPassword?: string;
}
