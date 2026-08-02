import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from './auth.types';
import { assertOrganizationScope } from './tenant-scope';

export type LocationPermission =
  | 'manage_location'
  | 'manage_events'
  | 'manage_tables'
  | 'manage_floor_plan'
  | 'manage_staff';

interface AccessRow extends QueryResultRow {
  id: string;
  timezone: string;
  status: 'ACTIVE' | 'INACTIVE';
  lifecycleStatus: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  assignmentId: string | null;
  canManageLocation: boolean | null;
  canManageEvents: boolean | null;
  canManageTables: boolean | null;
  canManageFloorPlan: boolean | null;
  canManageStaff: boolean | null;
}

@Injectable()
export class LocationAccessService {
  constructor(private readonly database: DatabaseService) {}

  async assert(
    auth: AuthContext,
    locationId: string,
    permission?: LocationPermission,
  ) {
    const organizationId = assertOrganizationScope(auth);
    const result = await this.database.pool.query<AccessRow>(
      `SELECT
         l.id,
         l.timezone,
         l.status,
         COALESCE(ll.lifecycle_status::text, l.status::text) AS "lifecycleStatus",
         oml.id AS "assignmentId",
         oml.can_manage_location AS "canManageLocation",
         oml.can_manage_events AS "canManageEvents",
         oml.can_manage_tables AS "canManageTables",
         oml.can_manage_floor_plan AS "canManageFloorPlan",
         oml.can_manage_staff AS "canManageStaff"
       FROM locations l
       LEFT JOIN location_lifecycle ll ON ll.location_id=l.id
       LEFT JOIN organization_membership_locations oml
         ON oml.organization_id=l.organization_id
        AND oml.location_id=l.id
        AND oml.membership_id=$3
        AND oml.active=TRUE
       WHERE l.id=$1 AND l.organization_id=$2
       LIMIT 1`,
      [locationId, organizationId, auth.membershipId],
    );
    const location = result.rows[0];

    if (
      !location ||
      location.status !== 'ACTIVE' ||
      location.lifecycleStatus !== 'ACTIVE'
    ) {
      throw new NotFoundException({
        code: 'LOCATION_NOT_FOUND',
        message: 'Location attiva non trovata.',
      });
    }

    if (auth.role === 'OWNER' || auth.role === 'ADMIN') {
      return { organizationId, locationId, timezone: location.timezone };
    }

    if (!location.assignmentId) {
      throw new ForbiddenException({
        code: 'LOCATION_ACCESS_DENIED',
        message: 'Non sei assegnato a questa location.',
      });
    }

    if (permission && !this.hasPermission(location, permission)) {
      throw new ForbiddenException({
        code: 'LOCATION_PERMISSION_DENIED',
        message: 'Non hai il permesso richiesto per questa location.',
      });
    }

    return { organizationId, locationId, timezone: location.timezone };
  }

  private hasPermission(row: AccessRow, permission: LocationPermission) {
    const map: Record<LocationPermission, boolean | null> = {
      manage_location: row.canManageLocation,
      manage_events: row.canManageEvents,
      manage_tables: row.canManageTables,
      manage_floor_plan: row.canManageFloorPlan,
      manage_staff: row.canManageStaff,
    };
    return map[permission] === true;
  }
}
