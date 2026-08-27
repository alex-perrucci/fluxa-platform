import { IsIn, IsString, Length, Matches } from 'class-validator';
import {
  SUBSCRIPTION_PLANS,
  type SubscriptionPlan,
} from '../../subscriptions/entitlements';

export class CreateOrganizationDto {
  @IsString()
  @Length(2, 180)
  name!: string;

  @IsString()
  @Length(3, 80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @IsIn(SUBSCRIPTION_PLANS)
  plan!: SubscriptionPlan;
}
