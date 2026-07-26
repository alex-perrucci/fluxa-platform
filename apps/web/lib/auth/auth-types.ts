export type MembershipRole =
  | 'OWNER'
  | 'ADMIN'
  | 'MANAGER'
  | 'CASHIER'
  | 'WAITER'
  | 'ACCOUNTANT'
  | 'SUPPORT_READONLY';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface AvailableOrganization {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: MembershipRole;
  defaultLocationId: string | null;
}

export interface ActiveOrganization {
  id: string;
  name: string;
  slug: string;
  role: MembershipRole;
}

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    platformAdmin: boolean;
  };
  device: {
    id: string;
    installationId: string;
    name: string;
    platform: string;
  };
  organization: ActiveOrganization | null;
  availableOrganizations: AvailableOrganization[];
  tokens: TokenPair;
}

export interface RefreshResponse {
  organization: ActiveOrganization | null;
  tokens: TokenPair;
}

export interface MeResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    platformAdmin: boolean;
  };
  session: {
    id: string;
    organizationId: string | null;
    membershipId: string | null;
    role: MembershipRole | null;
  };
  device: unknown;
  availableOrganizations: AvailableOrganization[];
}

export interface AuthenticatedSession extends MeResponse {
  organization: ActiveOrganization | null;
}
