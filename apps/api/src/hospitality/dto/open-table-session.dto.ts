import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
export class OpenTableSessionDto {
  @IsUUID() clientSessionId!: string;
  @IsUUID() tableId!: string;
  @IsInt() @Min(1) @Max(100) guestCount!: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
