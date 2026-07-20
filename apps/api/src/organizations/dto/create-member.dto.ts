import { IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { membershipRole, type MembershipRole } from '@fluxa/database';

export class CreateMemberDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(2, 160)
  displayName!: string;

  @IsIn(membershipRole.enumValues)
  role!: MembershipRole;

  @IsOptional()
  @IsString()
  @Length(12, 200)
  temporaryPassword?: string;
}
