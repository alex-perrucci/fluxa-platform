import type { Request } from 'express';
import type { MembershipRole } from '@fluxa/database';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  oid: string | null;
  mid: string | null;
  role: MembershipRole | null;
  pa: boolean;
  typ: 'access';
  iat?: number;
  exp?: number;
}

export interface AuthContext {
  userId: string;
  sessionId: string;
  deviceId: string;
  email: string;
  displayName: string;
  platformAdmin: boolean;
  organizationId: string | null;
  membershipId: string | null;
  role: MembershipRole | null;
}

export interface AuthenticatedRequest extends Request {
  auth: AuthContext;
}

export interface RequestMetadata {
  ip?: string;
  userAgent?: string;
}
