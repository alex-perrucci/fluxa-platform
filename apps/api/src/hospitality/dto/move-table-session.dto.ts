import { IsUUID } from 'class-validator';
import { SessionMutationDto } from './session-mutation.dto';
export class MoveTableSessionDto extends SessionMutationDto {
  @IsUUID() tableId!: string;
}
