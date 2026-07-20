import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class UpdateCurrentDeviceDto {
  @IsOptional()
  @IsString()
  @Length(2, 160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;
}
