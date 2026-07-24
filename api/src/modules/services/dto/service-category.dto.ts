import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateServiceCategoryDto {
  @IsString()
  @Length(1, 60)
  name!: string;

  // Omitted/undefined = top-level category. When set, must point at an
  // existing top-level category (only one level of nesting is supported —
  // enforced in ServiceCategoriesService, not here).
  @IsOptional()
  @IsInt()
  @Min(1)
  parentId?: number;
}

export class UpdateServiceCategoryDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  // Three states matter here: omitted (don't touch), null (move back to
  // top-level), or a number (nest under that category). @IsOptional()
  // already lets `null` skip @IsInt/@Min below, per class-validator's
  // "empty === null || undefined" rule — so only real numbers get validated.
  @IsOptional()
  @IsInt()
  @Min(1)
  parentId?: number | null;
}
