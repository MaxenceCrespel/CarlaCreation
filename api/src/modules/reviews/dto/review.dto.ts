import { IsEmpty, IsIn, IsInt, IsString, Length, Max, Min } from 'class-validator';
import type { ReviewStatus } from '../../../database/entities';

export class CreateReviewDto {
  @IsString()
  @Length(2, 100)
  clientName!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsString()
  @Length(5, 1000)
  comment!: string;

  // Honeypot: must stay empty. Bots that auto-fill every field trip this.
  @IsEmpty({ message: 'Requête invalide.' })
  website?: string;
}

export class UpdateReviewStatusDto {
  @IsIn(['approved', 'rejected', 'pending'])
  status!: ReviewStatus;
}
