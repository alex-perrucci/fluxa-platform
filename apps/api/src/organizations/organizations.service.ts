import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import {
  auditEvents,
  deviceAssignments,
  devices,
  locations,
  organizationMemberships,
  organizations,
  users,
  type MembershipRole,
} from '@fluxa/database';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { hashPassword } from '../auth/crypto';
import { assertOrganizationScope } from '../auth/tenant-scope';
import type { CreateMemberDto } from './dto/create-member.dto';
import type { CreateOrganizationDto } from './dto/create-organization.dto';
import type { UpdateMemberDto } from './dto/update-member.dto';
import { memberRoleRequiresLocation } from './member-location-policy';

@Injectable()
export class OrganizationsService {
  constructor(private readonly database: DatabaseService) {}

  async listAccessible(auth: AuthContext) {
    if (auth.platformAdmin && !auth.organizationId) {
      return this.database.db
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          status: organizations.status,
          createdAt: organizations.createdAt,
        })
        .from(organizations)
        .orderBy(asc(organizations.name));
    }

    return this.database.db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        status: organizations.status,
        role: organizationMemberships.role,
        membershipStatus: organizationMemberships.status,
      })
      .from(organizationMemberships)
      .innerJoin(
        organizations,
        eq(organizations.id, organizationMemberships.organizationId),
      )
      .where(eq(organizationMemberships.userId, auth.userId))
      .orderBy(asc(organizations.name));
  }

  async create(auth: AuthContext, dto: CreateOrganizationDto) {
    const slug = dto.slug.trim().toLowerCase();

    try {
      return await this.database.db.transaction(async (tx) => {
        const [organization] = await tx
          .insert(organizations)
          .values({
            name: dto.name.trim(),
            slug,
            createdByUserId: auth.userId,
          })
          .returning();

        const [membership] = await tx
          .insert(organizationMemberships)
          .values({
            organizationId: organization.id,
            userId: auth.userId,
            role: 'OWNER',
          })
          .returning();

        await tx.insert(auditEvents).values({
          organizationId: organization.id,
          actorUserId: auth.userId,
          action: 'organization.created',
          entityType: 'organization',
          entityId: organization.id,
          payload: { slug },
        });

        return { organization, membership };
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'ORGANIZATION_SLUG_ALREADY_EXISTS',
          message: "Lo slug dell'organizzazione è già utilizzato.",
        });
      }

      throw error;
    }
  }

  async getById(auth: AuthContext, organizationId: string) {
    assertOrganizationScope(auth, organizationId);

    const [organization] = await this.database.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!organization) {
      throw new NotFoundException({
        code: 'ORGANIZATION_NOT_FOUND',
        message: 'Organizzazione non trovata.',
      });
    }

    return organization;
  }

  async listMembers(auth: AuthContext, organizationId: string) {
    assertOrganizationScope(auth, organizationId);

    return this.database.db
      .select({
        membershipId: organizationMemberships.id,
        userId: users.id,
        email: users.email,
        displayName: users.displayName,
        userStatus: users.status,
        role: organizationMemberships.role,
        membershipStatus: organizationMemberships.status,
        locationId: organizationMemberships.defaultLocationId,
        locationName: locations.name,
        createdAt: organizationMemberships.createdAt,
      })
      .from(organizationMemberships)
      .innerJoin(users, eq(users.id, organizationMemberships.userId))
      .leftJoin(
        locations,
        eq(locations.id, organizationMemberships.defaultLocationId),
      )
      .where(eq(organizationMemberships.organizationId, organizationId))
      .orderBy(asc(users.displayName));
  }

  async addMember(
    auth: AuthContext,
    organizationId: string,
    dto: CreateMemberDto,
  ) {
    assertOrganizationScope(auth, organizationId);

    const email = dto.email.trim().toLowerCase();
    const defaultLocationId = await this.resolveMemberLocation(
      organizationId,
      dto.role,
      dto.locationId,
    );

    return this.database.db.transaction(async (tx) => {
      let [user] = await tx
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!user) {
        if (!dto.temporaryPassword) {
          throw new BadRequestException({
            code: 'TEMPORARY_PASSWORD_REQUIRED',
            message:
              'Per un nuovo utente è obbligatoria una password temporanea.',
          });
        }

        const [createdUser] = await tx
          .insert(users)
          .values({
            email,
            displayName: dto.displayName.trim(),
            passwordHash: await hashPassword(dto.temporaryPassword),
          })
          .returning();

        user = createdUser;
      }

      const [membership] = await tx
        .insert(organizationMemberships)
        .values({
          organizationId,
          userId: user.id,
          role: dto.role,
          status: 'ACTIVE',
          defaultLocationId,
        })
        .onConflictDoUpdate({
          target: [
            organizationMemberships.organizationId,
            organizationMemberships.userId,
          ],
          set: {
            role: dto.role,
            status: 'ACTIVE',
            defaultLocationId,
            updatedAt: new Date(),
          },
        })
        .returning();

      const activeDevices = await tx
        .select({ id: devices.id })
        .from(devices)
        .where(and(eq(devices.userId, user.id), eq(devices.status, 'ACTIVE')));

      if (activeDevices.length > 0) {
        await tx
          .update(deviceAssignments)
          .set({
            locationId: defaultLocationId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(deviceAssignments.organizationId, organizationId),
              eq(deviceAssignments.active, true),
              inArray(
                deviceAssignments.deviceId,
                activeDevices.map((device) => device.id),
              ),
            ),
          );
      }

      await tx.insert(auditEvents).values({
        organizationId,
        actorUserId: auth.userId,
        action: 'organization.member.upserted',
        entityType: 'organization_membership',
        entityId: membership.id,
        payload: {
          userId: user.id,
          email,
          role: dto.role,
          locationId: defaultLocationId,
        },
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
        },
        membership,
      };
    });
  }

  async updateMember(
    auth: AuthContext,
    organizationId: string,
    membershipId: string,
    dto: UpdateMemberDto,
  ) {
    assertOrganizationScope(auth, organizationId);

    const [current] = await this.database.db
      .select()
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.id, membershipId),
          eq(organizationMemberships.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!current) {
      throw new NotFoundException({
        code: 'MEMBERSHIP_NOT_FOUND',
        message: 'Appartenenza non trovata.',
      });
    }

    const removingActiveOwner =
      current.role === 'OWNER' &&
      current.status === 'ACTIVE' &&
      ((dto.role !== undefined && dto.role !== 'OWNER') ||
        dto.status === 'SUSPENDED');

    if (removingActiveOwner) {
      const [{ value }] = await this.database.db
        .select({ value: count() })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organizationId, organizationId),
            eq(organizationMemberships.role, 'OWNER'),
            eq(organizationMemberships.status, 'ACTIVE'),
          ),
        );

      if (Number(value) <= 1) {
        throw new ForbiddenException({
          code: 'LAST_OWNER_CANNOT_BE_REMOVED',
          message: "L'organizzazione deve mantenere almeno un proprietario.",
        });
      }
    }

    const nextRole = dto.role ?? current.role;
    const nextLocationId = await this.resolveMemberLocation(
      organizationId,
      nextRole,
      dto.locationId === undefined ? current.defaultLocationId : dto.locationId,
    );

    return this.database.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(organizationMemberships)
        .set({
          role: nextRole,
          status: dto.status ?? current.status,
          defaultLocationId: nextLocationId,
          updatedAt: new Date(),
        })
        .where(eq(organizationMemberships.id, membershipId))
        .returning();

      if (dto.locationId !== undefined) {
        const activeDevices = await tx
          .select({ id: devices.id })
          .from(devices)
          .where(
            and(
              eq(devices.userId, current.userId),
              eq(devices.status, 'ACTIVE'),
            ),
          );

        if (activeDevices.length > 0) {
          await tx
            .update(deviceAssignments)
            .set({
              locationId: nextLocationId,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(deviceAssignments.organizationId, organizationId),
                eq(deviceAssignments.active, true),
                inArray(
                  deviceAssignments.deviceId,
                  activeDevices.map((device) => device.id),
                ),
              ),
            );
        }
      }

      await tx.insert(auditEvents).values({
        organizationId,
        actorUserId: auth.userId,
        action: 'organization.member.updated',
        entityType: 'organization_membership',
        entityId: membershipId,
        payload: {
          previousRole: current.role,
          previousStatus: current.status,
          previousLocationId: current.defaultLocationId,
          role: updated.role,
          status: updated.status,
          locationId: updated.defaultLocationId,
        },
      });

      return updated;
    });
  }

  private async resolveMemberLocation(
    organizationId: string,
    role: MembershipRole,
    requestedLocationId?: string | null,
  ): Promise<string | null> {
    if (!requestedLocationId) {
      if (memberRoleRequiresLocation(role)) {
        throw new BadRequestException({
          code: 'MEMBER_LOCATION_REQUIRED',
          message:
            'Cassieri e camerieri devono essere assegnati a una location.',
        });
      }
      return null;
    }

    const [location] = await this.database.db
      .select({ id: locations.id })
      .from(locations)
      .where(
        and(
          eq(locations.id, requestedLocationId),
          eq(locations.organizationId, organizationId),
          eq(locations.status, 'ACTIVE'),
        ),
      )
      .limit(1);

    if (!location) {
      throw new NotFoundException({
        code: 'MEMBER_LOCATION_NOT_FOUND',
        message:
          "La location selezionata non appartiene all'organizzazione o non è attiva.",
      });
    }

    return location.id;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }
}
