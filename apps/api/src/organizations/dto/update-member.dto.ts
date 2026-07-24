import { IsIn, IsOptional, IsUUID } from 'class-validator';
import {
  membershipRole,
  membershipStatus,
  type MembershipRole,
  type MembershipStatus,
} from '@fluxa/database';

export class UpdateMemberDto {
  @IsOptional()
  @IsIn(membershipRole.enumValues)
  role?: MembershipRole;

  @IsOptional()
  @IsIn(membershipStatus.enumValues)
  status?: MembershipStatus;

  @IsOptional()
  @IsUUID()
  locationId?: string | null;
}
