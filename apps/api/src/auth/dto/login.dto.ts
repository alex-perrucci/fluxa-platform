import { Type } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';
import { DeviceDto } from './device.dto';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 200)
  password!: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ValidateNested()
  @Type(() => DeviceDto)
  device!: DeviceDto;
}
