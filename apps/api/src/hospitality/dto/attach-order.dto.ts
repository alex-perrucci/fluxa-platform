import { IsUUID } from 'class-validator';
import { SessionMutationDto } from './session-mutation.dto';
export class AttachOrderDto extends SessionMutationDto {
  @IsUUID() orderId!: string;
}
