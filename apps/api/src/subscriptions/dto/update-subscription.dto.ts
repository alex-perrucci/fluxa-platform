import { IsIn, IsISO8601, IsOptional } from 'class-validator';
import {
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUSES,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from '../entitlements';

export class UpdateSubscriptionDto {
  @IsIn(SUBSCRIPTION_PLANS)
  plan!: SubscriptionPlan;

  @IsIn(SUBSCRIPTION_STATUSES)
  status!: SubscriptionStatus;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string | null;
}
