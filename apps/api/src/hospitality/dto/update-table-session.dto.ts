import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SessionMutationDto } from './session-mutation.dto';
export class UpdateTableSessionDto extends SessionMutationDto {
  @IsOptional() @IsInt() @Min(1) @Max(100) guestCount?: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
