import { Injectable, NotFoundException } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import { resolveDeviceOperationalStatus } from './device-assignment-status';
import type { CurrentDeviceAssignmentResponseDto } from './dto/current-device-assignment.dto';

interface CurrentDeviceAssignmentRow extends QueryResultRow {
  deviceId: string;
  installationId: string;
  deviceName: string;
  platform: 'ANDROID' | 'IOS' | 'WINDOWS' | 'WEB' | 'OTHER';
  model: string | null;
  appVersion: string | null;
  deviceStatus: 'ACTIVE' | 'REVOKED';
  lastSeenAt: Date;
  assignmentId: string | null;
  assignmentLocationId: string | null;
  assignmentActive: boolean | null;
  operatorMode: 'AUTO' | 'CASHIER' | 'KITCHEN' | 'MANAGER' | null;
  assignedAt: Date | null;
  revokedAt: Date | null;
  assignmentUpdatedAt: Date | null;
  locationRecordId: string | null;
  locationCode: string | null;
  locationName: string | null;
  locationTimezone: string | null;
  locationStatus: 'ACTIVE' | 'INACTIVE' | null;
}

@Injectable()
export class CurrentDeviceAssignmentService {
  constructor(private readonly database: DatabaseService) {}

  async get(auth: AuthContext): Promise<CurrentDeviceAssignmentResponseDto> {
    const organizationId = assertOrganizationScope(auth);
    const result = await this.database.pool.query<CurrentDeviceAssignmentRow>(
      `
        SELECT
          d.id AS "deviceId",
          d.installation_id AS "installationId",
          d.name AS "deviceName",
          d.platform,
          d.model,
          d.app_version AS "appVersion",
          d.status AS "deviceStatus",
          d.last_seen_at AS "lastSeenAt",
          da.id AS "assignmentId",
          da.location_id AS "assignmentLocationId",
          da.active AS "assignmentActive",
          da.operator_mode::text AS "operatorMode",
          da.assigned_at AS "assignedAt",
          da.revoked_at AS "revokedAt",
          da.updated_at AS "assignmentUpdatedAt",
          l.id AS "locationRecordId",
          l.code AS "locationCode",
          l.name AS "locationName",
          l.timezone AS "locationTimezone",
          l.status AS "locationStatus"
        FROM devices d
        LEFT JOIN device_assignments da
          ON da.device_id = d.id
         AND da.organization_id = $3
        LEFT JOIN locations l
          ON l.id = da.location_id
         AND l.organization_id = $3
        WHERE d.id = $1
          AND d.user_id = $2
        LIMIT 1
      `,
      [auth.deviceId, auth.userId, organizationId],
    );
    const row = result.rows[0];

    if (!row) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: 'Dispositivo non trovato.',
      });
    }

    if (
      !row.assignmentId ||
      row.assignmentActive === null ||
      !row.assignedAt ||
      !row.assignmentUpdatedAt
    ) {
      throw new NotFoundException({
        code: 'DEVICE_ASSIGNMENT_NOT_FOUND',
        message: "Il dispositivo non è assegnato all'organizzazione corrente.",
      });
    }

    return {
      operationalStatus: resolveDeviceOperationalStatus({
        assignmentActive: row.assignmentActive,
        locationId: row.assignmentLocationId,
        locationStatus: row.locationStatus,
      }),
      device: {
        id: row.deviceId,
        installationId: row.installationId,
        name: row.deviceName,
        platform: row.platform,
        model: row.model,
        appVersion: row.appVersion,
        status: row.deviceStatus,
        lastSeenAt: row.lastSeenAt,
      },
      assignment: {
        id: row.assignmentId,
        organizationId,
        locationId: row.assignmentLocationId,
        active: row.assignmentActive,
        operatorMode: row.operatorMode ?? 'AUTO',
        assignedAt: row.assignedAt,
        revokedAt: row.revokedAt,
        updatedAt: row.assignmentUpdatedAt,
      },
      location:
        row.locationRecordId &&
        row.locationCode &&
        row.locationName &&
        row.locationTimezone &&
        row.locationStatus
          ? {
              id: row.locationRecordId,
              code: row.locationCode,
              name: row.locationName,
              timezone: row.locationTimezone,
              status: row.locationStatus,
            }
          : null,
    };
  }
}
