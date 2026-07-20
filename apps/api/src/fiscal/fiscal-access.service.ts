import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';

interface LocationAccessRow extends QueryResultRow {
  id: string;
  timezone: string;
  status: 'ACTIVE' | 'INACTIVE';
  assignmentId: string | null;
  assignmentLocationId: string | null;
}

@Injectable()
export class FiscalAccessService {
  constructor(private readonly database: DatabaseService) {}

  async assertLocation(auth: AuthContext, locationId: string) {
    const organizationId = assertOrganizationScope(auth);
    const result = await this.database.pool.query<LocationAccessRow>(
      `
        SELECT l.id, l.timezone, l.status,
          da.id AS "assignmentId", da.location_id AS "assignmentLocationId"
        FROM locations l
        LEFT JOIN device_assignments da
          ON da.organization_id = l.organization_id
         AND da.device_id = $3
         AND da.active = TRUE
        WHERE l.id = $1 AND l.organization_id = $2
        LIMIT 1
      `,
      [locationId, organizationId, auth.deviceId],
    );
    const location = result.rows[0];
    if (!location || location.status !== 'ACTIVE') {
      throw new NotFoundException({
        code: 'LOCATION_NOT_FOUND',
        message: 'Punto vendita attivo non trovato.',
      });
    }
    if (!location.assignmentId) {
      throw new ForbiddenException({
        code: 'DEVICE_NOT_ASSIGNED',
        message: "Il dispositivo non è assegnato all'organizzazione corrente.",
      });
    }
    if (
      location.assignmentLocationId &&
      location.assignmentLocationId !== locationId
    ) {
      throw new ForbiddenException({
        code: 'DEVICE_LOCATION_ACCESS_DENIED',
        message: 'Il dispositivo è assegnato a un altro punto vendita.',
      });
    }
    return { organizationId, locationId, timezone: location.timezone };
  }
}
