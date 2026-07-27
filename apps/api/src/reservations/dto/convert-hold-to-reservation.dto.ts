// PHASE_5_RESERVATION_CONVERSION
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class ConvertHoldToReservationDto {
  @IsUUID('4')
  reservationToken!: string;

  @IsString()
  @Length(2, 180)
  customerName!: string;

  @IsEmail()
  @MaxLength(320)
  customerEmail!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9 ()-]{6,40}$/)
  customerPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customerNote?: string;
}
