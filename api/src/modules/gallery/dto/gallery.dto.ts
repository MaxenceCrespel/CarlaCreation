import { Transform } from 'class-transformer';
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

  // null clears the category (photo goes back to untagged); omitted leaves
  // it untouched; a number sets/changes it.
  @IsOptional()
  @IsInt()
  @Min(1)
  categoryId?: number | null;
}

export class UploadGalleryDto {
  @IsString()
  @Length(2, 150)
  altText!: string;

  // Multipart fields always arrive as strings — an empty string means "no
  // category picked", treated the same as omitted.
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  categoryId?: number;
}
