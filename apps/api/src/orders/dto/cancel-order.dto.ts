import { IsString, Length } from 'class-validator';
import { OrderMutationDto } from './order-mutation.dto';

export class CancelOrderDto extends OrderMutationDto {
  @IsString()
  @Length(3, 500)
  reason!: string;
}
