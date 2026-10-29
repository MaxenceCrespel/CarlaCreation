import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

// Sent as multipart/form-data (an optional photo rides along), so every
// field arrives as a string.
export class SendMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;

  // Optional: the appointment the message is about ("Poser une question"
  // from a reservation). An empty string means none.
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined || value === null ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  reservationId?: number;
}
