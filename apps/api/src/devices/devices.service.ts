import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import {
  auditEvents,
  authSessions,
  deviceAssignments,
  devices,
  locations,
  organizationMemberships,
  users,
} from '@fluxa/database';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import type { AssignDeviceDto } from './dto/assign-device.dto';
import type { UpdateCurrentDeviceDto } from './dto/update-current-device.dto';

@Injectable()
export class DevicesService {
  constructor(private readonly database: DatabaseService) {}

  async current(auth: AuthContext) {
    const [device] = await this.database.db
      .select()
      .from(devices)
      .where(
        and(eq(devices.id, auth.deviceId), eq(devices.userId, auth.userId)),
      )
      .limit(1);

    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: 'Dispositivo non trovato.',
      });
    }

    return device;
  }

  async updateCurrent(auth: AuthContext, dto: UpdateCurrentDeviceDto) {
    const current = await this.current(auth);

    const [device] = await this.database.db
      .update(devices)
      .set({
        name: dto.name?.trim() ?? current.name,
        model:
          dto.model !== undefined ? dto.model.trim() || null : current.model,
        appVersion:
          dto.appVersion !== undefined
            ? dto.appVersion.trim() || null
            : current.appVersion,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(devices.id, current.id))
      .returning();

    return device;
  }

  async list(auth: AuthContext) {
    const organizationId = assertOrganizationScope(auth);

    return this.database.db
      .select({
        assignmentId: deviceAssignments.id,
        active: deviceAssignments.active,
        assignedAt: deviceAssignments.assignedAt,
        revokedAt: deviceAssignments.revokedAt,
        deviceId: devices.id,
        installationId: devices.installationId,
        deviceName: devices.name,
        platform: devices.platform,
        model: devices.model,
        appVersion: devices.appVersion,
        lastSeenAt: devices.lastSeenAt,
        userId: users.id,
        userEmail: users.email,
        userDisplayName: users.displayName,
        locationId: locations.id,
        locationName: locations.name,
      })
      .from(deviceAssignments)
      .innerJoin(devices, eq(devices.id, deviceAssignments.deviceId))
      .innerJoin(users, eq(users.id, devices.userId))
      .leftJoin(locations, eq(locations.id, deviceAssignments.locationId))
      .where(eq(deviceAssignments.organizationId, organizationId))
      .orderBy(asc(users.displayName), asc(devices.name));
  }

  async assign(auth: AuthContext, deviceId: string, dto: AssignDeviceDto) {
    const organizationId = assertOrganizationScope(auth);

    const [eligibleDevice] = await this.database.db
      .select({ id: devices.id })
      .from(devices)
      .innerJoin(
        organizationMemberships,
        eq(organizationMemberships.userId, devices.userId),
      )
      .where(
        and(
          eq(devices.id, deviceId),
          eq(devices.status, 'ACTIVE'),
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.status, 'ACTIVE'),
        ),
      )
      .limit(1);

    if (!eligibleDevice) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_ELIGIBLE',
        message:
          "Il dispositivo non appartiene a un membro attivo dell'organizzazione.",
      });
    }

    if (dto.locationId) {
      const [location] = await this.database.db
        .select({ id: locations.id })
        .from(locations)
        .where(
          and(
            eq(locations.id, dto.locationId),
            eq(locations.organizationId, organizationId),
          ),
        )
        .limit(1);

      if (!location) {
        throw new NotFoundException({
          code: 'LOCATION_NOT_FOUND',
          message: "Punto vendita non trovato nell'organizzazione corrente.",
        });
      }
    }

    const [assignment] = await this.database.db
      .insert(deviceAssignments)
      .values({
        deviceId,
        organizationId,
        locationId: dto.locationId ?? null,
        active: true,
      })
      .onConflictDoUpdate({
        target: [deviceAssignments.deviceId, deviceAssignments.organizationId],
        set: {
          locationId: dto.locationId ?? null,
          active: true,
          revokedAt: null,
          updatedAt: new Date(),
        },
      })
      .returning();

    await this.database.db.insert(auditEvents).values({
      organizationId,
      actorUserId: auth.userId,
      action: 'device.assigned',
      entityType: 'device_assignment',
      entityId: assignment.id,
      payload: {
        deviceId,
        locationId: dto.locationId ?? null,
      },
    });

    return assignment;
  }

  async revokeAssignment(auth: AuthContext, deviceId: string) {
    const organizationId = assertOrganizationScope(auth);

    const [assignment] = await this.database.db
      .update(deviceAssignments)
      .set({
        active: false,
        revokedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(deviceAssignments.deviceId, deviceId),
          eq(deviceAssignments.organizationId, organizationId),
          eq(deviceAssignments.active, true),
        ),
      )
      .returning();

    if (!assignment) {
      throw new NotFoundException({
        code: 'DEVICE_ASSIGNMENT_NOT_FOUND',
        message: 'Assegnazione del dispositivo non trovata.',
      });
    }

    await this.database.db
      .update(authSessions)
      .set({
        status: 'REVOKED',
        revokedAt: new Date(),
        revokeReason: 'DEVICE_ORGANIZATION_ASSIGNMENT_REVOKED',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(authSessions.deviceId, deviceId),
          eq(authSessions.organizationId, organizationId),
          eq(authSessions.status, 'ACTIVE'),
        ),
      );

    await this.database.db.insert(auditEvents).values({
      organizationId,
      actorUserId: auth.userId,
      action: 'device.assignment.revoked',
      entityType: 'device_assignment',
      entityId: assignment.id,
      payload: { deviceId },
    });

    return { success: true };
  }
}
