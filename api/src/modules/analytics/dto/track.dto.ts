import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class TrackPageViewDto {
  @IsString()
  @Length(1, 300)
  @Matches(/^\//, { message: 'path must be a pathname starting with /' })
  path!: string;

  // Channel tag read from ?src= in the landing URL (letters, digits, - and _ only).
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,30}$/)
  src?: string;
}
