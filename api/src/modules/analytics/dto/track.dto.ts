import { IsString, Length, Matches } from 'class-validator';

export class TrackPageViewDto {
  @IsString()
  @Length(1, 300)
  @Matches(/^\//, { message: 'path must be a pathname starting with /' })
  path!: string;
}
