import { IsIn, IsOptional, IsUUID } from 'class-validator';
export class TableSessionListQueryDto {
  @IsUUID() locationId!: string;
  @IsOptional() @IsIn(['OPEN', 'CLOSED', 'CANCELLED']) status?:
    'OPEN' | 'CLOSED' | 'CANCELLED';
}
