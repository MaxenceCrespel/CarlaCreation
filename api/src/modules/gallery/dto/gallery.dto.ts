import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class UpdateGalleryDto {
  @IsOptional()
  @IsString()
  @Length(2, 150)
  altText?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

export class UploadGalleryDto {
  @IsString()
  @Length(2, 150)
  altText!: string;
}
