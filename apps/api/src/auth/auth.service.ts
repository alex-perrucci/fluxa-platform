import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { and, eq } from 'drizzle-orm';
import {
  authSessions,
  deviceAssignments,
  devices,
  organizationMemberships,
  organizations,
  users,
  type DevicePlatform,
  type MembershipRole,
} from '@fluxa/database';
import { DatabaseService } from '@fluxa/database';
import {
  createRefreshToken,
  hashIpAddress,
  hashRefreshToken,
  parseRefreshToken,
  safeHashEquals,
  verifyPassword,
} from './crypto';
import type {
  AccessTokenPayload,
  AuthContext,
  RequestMetadata,
} from './auth.types';
import type { DeviceDto } from './dto/device.dto';
import type { LoginDto } from './dto/login.dto';
import type { SwitchOrganizationDto } from './dto/switch-organization.dto';

interface SelectedMembership {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: MembershipRole;
}

interface SessionSnapshot {
  sessionId: string;
  sessionUserId: string;
  sessionDeviceId: string;
  sessionOrganizationId: string | null;
  sessionMembershipId: string | null;
  refreshTokenHash: string;
  previousRefreshTokenHash: string | null;
  sessionStatus: 'ACTIVE' | 'REVOKED';
  expiresAt: Date;
  userId: string;
  email: string;
  displayName: string;
  platformAdmin: boolean;
  userStatus: 'ACTIVE' | 'DISABLED';
  deviceStatus: 'ACTIVE' | 'REVOKED';
  membershipId: string | null;
  membershipOrganizationId: string | null;
  membershipRole: MembershipRole | null;
  membershipStatus: 'ACTIVE' | 'SUSPENDED' | null;
  organizationStatus: 'ACTIVE' | 'SUSPENDED' | null;
  organizationName: string | null;
  organizationSlug: string | null;
}

@Injectable()
export class AuthService {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenTtlDays: number;
  private readonly accessTokenTtlSeconds: number;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly ipHashSecret: string;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {
    this.accessTokenSecret = this.config.getOrThrow<string>(
      'ACCESS_TOKEN_SECRET',
    );
    this.refreshTokenTtlDays = this.config.getOrThrow<number>(
      'REFRESH_TOKEN_TTL_DAYS',
    );
    this.accessTokenTtlSeconds = this.config.getOrThrow<number>(
      'ACCESS_TOKEN_TTL_SECONDS',
    );
    this.issuer = this.config.getOrThrow<string>('JWT_ISSUER');
    this.audience = this.config.getOrThrow<string>('JWT_AUDIENCE');
    this.ipHashSecret = this.config.getOrThrow<string>(
      'SESSION_IP_HASH_SECRET',
    );
  }

  async login(dto: LoginDto, metadata: RequestMetadata) {
    const email = this.normalizeEmail(dto.email);

    const [user] = await this.database.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (
      !user ||
      user.status !== 'ACTIVE' ||
      !(await verifyPassword(user.passwordHash, dto.password))
    ) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Email o password non valide.',
      });
    }

    const availableOrganizations = await this.listActiveMemberships(user.id);
    const selectedMembership = this.selectMembership(
      user.platformAdmin,
      availableOrganizations,
      dto.organizationId,
    );

    const device = await this.registerDevice(user.id, dto.device);

    await this.database.db
      .update(authSessions)
      .set({
        status: 'REVOKED',
        revokedAt: new Date(),
        revokeReason: 'SUPERSEDED_LOGIN',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(authSessions.userId, user.id),
          eq(authSessions.deviceId, device.id),
          eq(authSessions.status, 'ACTIVE'),
        ),
      );

    if (selectedMembership) {
      await this.ensureDeviceAssignment(
        device.id,
        selectedMembership.organizationId,
      );
    }

    const issued = await this.createSession(
      {
        userId: user.id,
        deviceId: device.id,
        email: user.email,
        displayName: user.displayName,
        platformAdmin: user.platformAdmin,
        membership: selectedMembership,
      },
      metadata,
    );

    await this.database.db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id));

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        platformAdmin: user.platformAdmin,
      },
      device: {
        id: device.id,
        installationId: device.installationId,
        name: device.name,
        platform: device.platform,
      },
      organization: selectedMembership
        ? {
            id: selectedMembership.organizationId,
            name: selectedMembership.organizationName,
            slug: selectedMembership.organizationSlug,
            role: selectedMembership.role,
          }
        : null,
      availableOrganizations,
      tokens: issued.tokens,
    };
  }

  async refresh(refreshToken: string, metadata: RequestMetadata) {
    const parsed = parseRefreshToken(refreshToken);
    if (!parsed) {
      throw this.invalidRefreshToken();
    }

    const snapshot = await this.loadSession(parsed.sessionId);
    if (!snapshot) {
      throw this.invalidRefreshToken();
    }

    const providedHash = hashRefreshToken(refreshToken);

    if (safeHashEquals(snapshot.previousRefreshTokenHash, providedHash)) {
      await this.revokeDeviceSessions(
        snapshot.userId,
        snapshot.sessionDeviceId,
        'REFRESH_TOKEN_REUSE_DETECTED',
      );

      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_REUSE_DETECTED',
        message:
          'Il refresh token è già stato usato. Le sessioni del dispositivo sono state revocate.',
      });
    }

    this.assertRefreshSessionUsable(snapshot, providedHash);
    const context = this.contextFromSnapshot(snapshot);

    return this.rotateSession(
      snapshot,
      providedHash,
      context.organizationId
        ? {
            id: context.membershipId!,
            organizationId: context.organizationId,
            organizationName: snapshot.organizationName ?? '',
            organizationSlug: snapshot.organizationSlug ?? '',
            role: context.role!,
          }
        : null,
      metadata,
    );
  }

  async switchOrganization(
    auth: AuthContext,
    dto: SwitchOrganizationDto,
    metadata: RequestMetadata,
  ) {
    const parsed = parseRefreshToken(dto.refreshToken);
    if (!parsed || parsed.sessionId !== auth.sessionId) {
      throw this.invalidRefreshToken();
    }

    const snapshot = await this.loadSession(auth.sessionId);
    if (!snapshot || snapshot.userId !== auth.userId) {
      throw this.invalidRefreshToken();
    }

    const providedHash = hashRefreshToken(dto.refreshToken);
    this.assertRefreshSessionUsable(snapshot, providedHash);

    const memberships = await this.listActiveMemberships(auth.userId);
    const selected = memberships.find(
      (membership) => membership.organizationId === dto.organizationId,
    );

    if (!selected) {
      throw new ForbiddenException({
        code: 'ORGANIZATION_ACCESS_DENIED',
        message: "Non appartieni all'organizzazione selezionata.",
      });
    }

    await this.ensureDeviceAssignment(auth.deviceId, dto.organizationId);

    return this.rotateSession(snapshot, providedHash, selected, metadata);
  }

  async logout(auth: AuthContext): Promise<{ success: true }> {
    await this.database.db
      .update(authSessions)
      .set({
        status: 'REVOKED',
        revokedAt: new Date(),
        revokeReason: 'LOGOUT',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(authSessions.id, auth.sessionId),
          eq(authSessions.userId, auth.userId),
        ),
      );

    return { success: true };
  }

  async logoutAll(auth: AuthContext): Promise<{ success: true }> {
    await this.database.db
      .update(authSessions)
      .set({
        status: 'REVOKED',
        revokedAt: new Date(),
        revokeReason: 'LOGOUT_ALL',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(authSessions.userId, auth.userId),
          eq(authSessions.status, 'ACTIVE'),
        ),
      );

    return { success: true };
  }

  async me(auth: AuthContext) {
    const [device] = await this.database.db
      .select({
        id: devices.id,
        installationId: devices.installationId,
        name: devices.name,
        platform: devices.platform,
        model: devices.model,
        appVersion: devices.appVersion,
        lastSeenAt: devices.lastSeenAt,
      })
      .from(devices)
      .where(eq(devices.id, auth.deviceId))
      .limit(1);

    const availableOrganizations = await this.listActiveMemberships(
      auth.userId,
    );

    return {
      user: {
        id: auth.userId,
        email: auth.email,
        displayName: auth.displayName,
        platformAdmin: auth.platformAdmin,
      },
      session: {
        id: auth.sessionId,
        organizationId: auth.organizationId,
        membershipId: auth.membershipId,
        role: auth.role,
      },
      device: device ?? null,
      availableOrganizations,
    };
  }

  async validateAccessToken(token: string): Promise<AuthContext> {
    let payload: AccessTokenPayload;

    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.accessTokenSecret,
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_ACCESS_TOKEN',
        message: 'Token di accesso non valido o scaduto.',
      });
    }

    if (payload.typ !== 'access' || !payload.sub || !payload.sid) {
      throw new UnauthorizedException({
        code: 'INVALID_ACCESS_TOKEN',
        message: 'Token di accesso non valido.',
      });
    }

    const snapshot = await this.loadSession(payload.sid);
    if (
      !snapshot ||
      snapshot.userId !== payload.sub ||
      snapshot.sessionStatus !== 'ACTIVE' ||
      snapshot.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException({
        code: 'SESSION_NOT_ACTIVE',
        message: 'La sessione non è più attiva.',
      });
    }

    const context = this.contextFromSnapshot(snapshot);

    if (
      payload.oid !== context.organizationId ||
      payload.mid !== context.membershipId
    ) {
      throw new UnauthorizedException({
        code: 'SESSION_CONTEXT_CHANGED',
        message: 'Il contesto della sessione è cambiato. Accedi nuovamente.',
      });
    }

    return context;
  }

  private async createSession(
    input: {
      userId: string;
      deviceId: string;
      email: string;
      displayName: string;
      platformAdmin: boolean;
      membership: SelectedMembership | null;
    },
    metadata: RequestMetadata,
  ) {
    const sessionId = randomUUID();
    const refreshToken = createRefreshToken(sessionId);
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const expiresAt = this.refreshExpiry();

    await this.database.db.insert(authSessions).values({
      id: sessionId,
      userId: input.userId,
      deviceId: input.deviceId,
      organizationId: input.membership?.organizationId ?? null,
      membershipId: input.membership?.id ?? null,
      refreshTokenHash,
      expiresAt,
      ipHash: hashIpAddress(metadata.ip, this.ipHashSecret),
      userAgent: metadata.userAgent?.slice(0, 500) ?? null,
    });

    const context: AuthContext = {
      userId: input.userId,
      sessionId,
      deviceId: input.deviceId,
      email: input.email,
      displayName: input.displayName,
      platformAdmin: input.platformAdmin,
      organizationId: input.membership?.organizationId ?? null,
      membershipId: input.membership?.id ?? null,
      role: input.membership?.role ?? null,
    };

    return {
      context,
      tokens: await this.tokenPair(context, refreshToken),
    };
  }

  private async rotateSession(
    snapshot: SessionSnapshot,
    currentRefreshHash: string,
    membership: SelectedMembership | null,
    metadata: RequestMetadata,
  ) {
    const refreshToken = createRefreshToken(snapshot.sessionId);
    const newHash = hashRefreshToken(refreshToken);
    const expiresAt = this.refreshExpiry();

    const updated = await this.database.db
      .update(authSessions)
      .set({
        organizationId: membership?.organizationId ?? null,
        membershipId: membership?.id ?? null,
        previousRefreshTokenHash: currentRefreshHash,
        refreshTokenHash: newHash,
        expiresAt,
        lastRotatedAt: new Date(),
        ipHash: hashIpAddress(metadata.ip, this.ipHashSecret),
        userAgent: metadata.userAgent?.slice(0, 500) ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(authSessions.id, snapshot.sessionId),
          eq(authSessions.status, 'ACTIVE'),
          eq(authSessions.refreshTokenHash, currentRefreshHash),
        ),
      )
      .returning({ id: authSessions.id });

    if (updated.length !== 1) {
      await this.revokeDeviceSessions(
        snapshot.userId,
        snapshot.sessionDeviceId,
        'CONCURRENT_REFRESH_DETECTED',
      );

      throw new UnauthorizedException({
        code: 'CONCURRENT_REFRESH_DETECTED',
        message: "Sessione ruotata da un'altra richiesta.",
      });
    }

    const context: AuthContext = {
      userId: snapshot.userId,
      sessionId: snapshot.sessionId,
      deviceId: snapshot.sessionDeviceId,
      email: snapshot.email,
      displayName: snapshot.displayName,
      platformAdmin: snapshot.platformAdmin,
      organizationId: membership?.organizationId ?? null,
      membershipId: membership?.id ?? null,
      role: membership?.role ?? null,
    };

    return {
      organization: membership
        ? {
            id: membership.organizationId,
            name: membership.organizationName,
            slug: membership.organizationSlug,
            role: membership.role,
          }
        : null,
      tokens: await this.tokenPair(context, refreshToken),
    };
  }

  private async tokenPair(context: AuthContext, refreshToken: string) {
    const payload: AccessTokenPayload = {
      sub: context.userId,
      sid: context.sessionId,
      oid: context.organizationId,
      mid: context.membershipId,
      role: context.role,
      pa: context.platformAdmin,
      typ: 'access',
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.accessTokenSecret,
      algorithm: 'HS256',
      issuer: this.issuer,
      audience: this.audience,
      expiresIn: this.accessTokenTtlSeconds,
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTokenTtlSeconds,
    };
  }

  private async registerDevice(userId: string, dto: DeviceDto) {
    const [existing] = await this.database.db
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.userId, userId),
          eq(devices.installationId, dto.installationId),
        ),
      )
      .limit(1);

    if (existing?.status === 'REVOKED') {
      throw new ForbiddenException({
        code: 'DEVICE_REVOKED',
        message: 'Questo dispositivo è stato revocato.',
      });
    }

    if (existing) {
      const [updated] = await this.database.db
        .update(devices)
        .set({
          name: dto.name,
          platform: dto.platform,
          model: dto.model ?? null,
          appVersion: dto.appVersion ?? null,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(devices.id, existing.id))
        .returning();

      return updated;
    }

    const [created] = await this.database.db
      .insert(devices)
      .values({
        userId,
        installationId: dto.installationId,
        name: dto.name,
        platform: dto.platform as DevicePlatform,
        model: dto.model ?? null,
        appVersion: dto.appVersion ?? null,
      })
      .returning();

    return created;
  }

  private async ensureDeviceAssignment(
    deviceId: string,
    organizationId: string,
  ): Promise<void> {
    await this.database.db
      .insert(deviceAssignments)
      .values({
        deviceId,
        organizationId,
        active: true,
      })
      .onConflictDoUpdate({
        target: [deviceAssignments.deviceId, deviceAssignments.organizationId],
        set: {
          active: true,
          revokedAt: null,
          updatedAt: new Date(),
        },
      });
  }

  private async listActiveMemberships(
    userId: string,
  ): Promise<SelectedMembership[]> {
    const rows = await this.database.db
      .select({
        id: organizationMemberships.id,
        organizationId: organizationMemberships.organizationId,
        organizationName: organizations.name,
        organizationSlug: organizations.slug,
        role: organizationMemberships.role,
      })
      .from(organizationMemberships)
      .innerJoin(
        organizations,
        eq(organizations.id, organizationMemberships.organizationId),
      )
      .where(
        and(
          eq(organizationMemberships.userId, userId),
          eq(organizationMemberships.status, 'ACTIVE'),
          eq(organizations.status, 'ACTIVE'),
        ),
      );

    return rows;
  }

  private selectMembership(
    platformAdmin: boolean,
    memberships: SelectedMembership[],
    requestedOrganizationId?: string,
  ): SelectedMembership | null {
    if (requestedOrganizationId) {
      const selected = memberships.find(
        (membership) => membership.organizationId === requestedOrganizationId,
      );

      if (!selected) {
        throw new ForbiddenException({
          code: 'ORGANIZATION_ACCESS_DENIED',
          message: "Non appartieni all'organizzazione selezionata.",
        });
      }

      return selected;
    }

    if (platformAdmin) return null;
    if (memberships.length === 1) return memberships[0];

    if (memberships.length > 1) {
      throw new ConflictException({
        code: 'ORGANIZATION_SELECTION_REQUIRED',
        message: "Seleziona l'organizzazione con cui accedere.",
        organizations: memberships,
      });
    }

    throw new ForbiddenException({
      code: 'NO_ACTIVE_MEMBERSHIP',
      message: 'Non hai accesso ad alcuna organizzazione attiva.',
    });
  }

  private async loadSession(
    sessionId: string,
  ): Promise<SessionSnapshot | null> {
    const [row] = await this.database.db
      .select({
        sessionId: authSessions.id,
        sessionUserId: authSessions.userId,
        sessionDeviceId: authSessions.deviceId,
        sessionOrganizationId: authSessions.organizationId,
        sessionMembershipId: authSessions.membershipId,
        refreshTokenHash: authSessions.refreshTokenHash,
        previousRefreshTokenHash: authSessions.previousRefreshTokenHash,
        sessionStatus: authSessions.status,
        expiresAt: authSessions.expiresAt,
        userId: users.id,
        email: users.email,
        displayName: users.displayName,
        platformAdmin: users.platformAdmin,
        userStatus: users.status,
        deviceStatus: devices.status,
        membershipId: organizationMemberships.id,
        membershipOrganizationId: organizationMemberships.organizationId,
        membershipRole: organizationMemberships.role,
        membershipStatus: organizationMemberships.status,
        organizationStatus: organizations.status,
        organizationName: organizations.name,
        organizationSlug: organizations.slug,
      })
      .from(authSessions)
      .innerJoin(users, eq(users.id, authSessions.userId))
      .innerJoin(devices, eq(devices.id, authSessions.deviceId))
      .leftJoin(
        organizationMemberships,
        eq(organizationMemberships.id, authSessions.membershipId),
      )
      .leftJoin(
        organizations,
        eq(organizations.id, authSessions.organizationId),
      )
      .where(eq(authSessions.id, sessionId))
      .limit(1);

    return row ?? null;
  }

  private contextFromSnapshot(snapshot: SessionSnapshot): AuthContext {
    if (
      snapshot.userStatus !== 'ACTIVE' ||
      snapshot.deviceStatus !== 'ACTIVE'
    ) {
      throw new UnauthorizedException({
        code: 'IDENTITY_NOT_ACTIVE',
        message: 'Utente o dispositivo non attivo.',
      });
    }

    if (snapshot.sessionOrganizationId) {
      if (
        !snapshot.sessionMembershipId ||
        snapshot.membershipId !== snapshot.sessionMembershipId ||
        snapshot.membershipOrganizationId !== snapshot.sessionOrganizationId ||
        snapshot.membershipStatus !== 'ACTIVE' ||
        snapshot.organizationStatus !== 'ACTIVE' ||
        !snapshot.membershipRole
      ) {
        throw new UnauthorizedException({
          code: 'MEMBERSHIP_NOT_ACTIVE',
          message: "L'accesso all'organizzazione non è più attivo.",
        });
      }
    }

    return {
      userId: snapshot.userId,
      sessionId: snapshot.sessionId,
      deviceId: snapshot.sessionDeviceId,
      email: snapshot.email,
      displayName: snapshot.displayName,
      platformAdmin: snapshot.platformAdmin,
      organizationId: snapshot.sessionOrganizationId,
      membershipId: snapshot.sessionMembershipId,
      role: snapshot.membershipRole,
    };
  }

  private assertRefreshSessionUsable(
    snapshot: SessionSnapshot,
    providedHash: string,
  ): void {
    if (
      snapshot.sessionStatus !== 'ACTIVE' ||
      snapshot.expiresAt.getTime() <= Date.now() ||
      !safeHashEquals(snapshot.refreshTokenHash, providedHash)
    ) {
      throw this.invalidRefreshToken();
    }

    this.contextFromSnapshot(snapshot);
  }

  private async revokeDeviceSessions(
    userId: string,
    deviceId: string,
    reason: string,
  ): Promise<void> {
    await this.database.db
      .update(authSessions)
      .set({
        status: 'REVOKED',
        revokedAt: new Date(),
        revokeReason: reason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(authSessions.userId, userId),
          eq(authSessions.deviceId, deviceId),
          eq(authSessions.status, 'ACTIVE'),
        ),
      );
  }

  private refreshExpiry(): Date {
    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + this.refreshTokenTtlDays);
    return expiresAt;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private invalidRefreshToken(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Refresh token non valido o scaduto.',
    });
  }
}
