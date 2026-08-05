import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { QueryResultRow } from 'pg';
import {
  auditEvents,
  authSessions,
  devices,
  locations,
  organizationMemberships,
} from '@fluxa/database';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import type { AssignDeviceDto } from './dto/assign-device.dto';
import type { UpdateCurrentDeviceDto } from './dto/update-current-device.dto';

interface DeviceAssignmentListRow extends QueryResultRow {
  assignmentId: string;
  active: boolean;
  operatorMode: 'AUTO' | 'CASHIER' | 'KITCHEN' | 'MANAGER';
  assignedAt: Date;
  revokedAt: Date | null;
  deviceId: string;
  installationId: string;
  deviceName: string;
  platform: string;
  model: string | null;
  appVersion: string | null;
  lastSeenAt: Date;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  locationId: string | null;
  locationName: string | null;
}

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
    const result = await this.database.pool.query<DeviceAssignmentListRow>(
      `SELECT da.id AS "assignmentId",da.active,
         da.operator_mode::text AS "operatorMode",
         da.assigned_at AS "assignedAt",da.revoked_at AS "revokedAt",
         d.id AS "deviceId",d.installation_id AS "installationId",
         d.name AS "deviceName",d.platform::text,d.model,
         d.app_version AS "appVersion",d.last_seen_at AS "lastSeenAt",
         u.id AS "userId",u.email AS "userEmail",
         u.display_name AS "userDisplayName",l.id AS "locationId",
         l.name AS "locationName"
       FROM device_assignments da
       INNER JOIN devices d ON d.id=da.device_id
       INNER JOIN users u ON u.id=d.user_id
       LEFT JOIN locations l ON l.id=da.location_id
       WHERE da.organization_id=$1
       ORDER BY u.display_name,d.name`,
      [organizationId],
    );
    return result.rows;
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

    const result = await this.database.pool.query<
      { id: string } & QueryResultRow
    >(
      `INSERT INTO device_assignments
       (device_id,organization_id,location_id,operator_mode,active)
       VALUES ($1,$2,$3,$4::pos_operator_mode,true)
       ON CONFLICT (device_id,organization_id) DO UPDATE SET
         location_id=EXCLUDED.location_id,
         operator_mode=EXCLUDED.operator_mode,
         active=true,revoked_at=NULL,updated_at=NOW()
       RETURNING id`,
      [
        deviceId,
        organizationId,
        dto.locationId ?? null,
        dto.operatorMode ?? 'AUTO',
      ],
    );
    const assignment = result.rows[0];

    await this.database.db.insert(auditEvents).values({
      organizationId,
      actorUserId: auth.userId,
      action: 'device.assigned',
      entityType: 'device_assignment',
      entityId: assignment.id,
      payload: {
        deviceId,
        locationId: dto.locationId ?? null,
        operatorMode: dto.operatorMode ?? 'AUTO',
      },
    });

    return {
      id: assignment.id,
      deviceId,
      organizationId,
      locationId: dto.locationId ?? null,
      operatorMode: dto.operatorMode ?? 'AUTO',
      active: true,
    };
  }

  async revokeAssignment(auth: AuthContext, deviceId: string) {
    const organizationId = assertOrganizationScope(auth);
    const result = await this.database.pool.query<
      { id: string } & QueryResultRow
    >(
      `UPDATE device_assignments SET active=false,revoked_at=NOW(),updated_at=NOW()
       WHERE device_id=$1 AND organization_id=$2 AND active=true RETURNING id`,
      [deviceId, organizationId],
    );
    const assignment = result.rows[0];

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
