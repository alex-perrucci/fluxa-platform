import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export enum DevicePlatformInput {
  ANDROID = 'ANDROID',
  IOS = 'IOS',
  WINDOWS = 'WINDOWS',
  WEB = 'WEB',
  OTHER = 'OTHER',
}

export class DeviceDto {
  @IsString()
  @Length(16, 200)
  installationId!: string;

  @IsString()
  @Length(2, 160)
  name!: string;

  @IsEnum(DevicePlatformInput)
  platform!: DevicePlatformInput;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;
}
