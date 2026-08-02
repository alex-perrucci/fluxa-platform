import { Injectable } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';

interface FloorPlanLocationRow extends QueryResultRow {
  id: string;
  code: string;
  name: string;
  city: string;
  timezone: string;
}

@Injectable()
export class FloorPlanLocationsService {
  constructor(private readonly database: DatabaseService) {}

  async list(auth: AuthContext): Promise<FloorPlanLocationRow[]> {
    const organizationId = assertOrganizationScope(auth);
    const globallyScoped = auth.role === 'OWNER' || auth.role === 'ADMIN';
    const result = await this.database.pool.query<FloorPlanLocationRow>(
      `SELECT l.id, l.code, l.name, l.city, l.timezone
       FROM locations l
       LEFT JOIN location_lifecycle ll ON ll.location_id=l.id
       LEFT JOIN organization_membership_locations oml
         ON oml.organization_id=l.organization_id
        AND oml.location_id=l.id
        AND oml.membership_id=$2
        AND oml.active=TRUE
        AND oml.can_manage_floor_plan=TRUE
       WHERE l.organization_id=$1
         AND l.status='ACTIVE'
         AND COALESCE(ll.lifecycle_status::text,l.status::text)='ACTIVE'
         AND ($3::boolean OR oml.id IS NOT NULL)
       ORDER BY l.name`,
      [organizationId, auth.membershipId, globallyScoped],
    );
    return result.rows;
  }
}
