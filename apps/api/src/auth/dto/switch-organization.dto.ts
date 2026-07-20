import { IsString, IsUUID, MinLength } from 'class-validator';

export class SwitchOrganizationDto {
  @IsUUID()
  organizationId!: string;

  @IsString()
  @MinLength(40)
  refreshToken!: string;
}
