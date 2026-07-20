import { IsOptional, IsString, MaxLength } from 'class-validator';
import { SessionMutationDto } from './session-mutation.dto';
export class CloseTableSessionDto extends SessionMutationDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
