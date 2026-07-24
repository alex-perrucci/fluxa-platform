import type { MembershipRole } from '@fluxa/database';

export function memberRoleRequiresLocation(role: MembershipRole): boolean {
  return role === 'CASHIER' || role === 'WAITER';
}
