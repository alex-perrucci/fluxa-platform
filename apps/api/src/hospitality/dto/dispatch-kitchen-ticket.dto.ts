import { IsUUID } from 'class-validator';
export class DispatchKitchenTicketDto {
  @IsUUID() clientBatchId!: string;
}
