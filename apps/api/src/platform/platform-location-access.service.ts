import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import type { ReplacePlatformLocationAccessDto } from './dto/platform-location-access.dto';

interface MembershipRow extends QueryResultRow {
  id: string;
  role: string;
}

interface PlatformLocationAccessRow extends QueryResultRow {
  locationId: string;
  locationCode: string;
  locationName: string;
  active: boolean;
  canManageLocation: boolean;
  canManageEvents: boolean;
  canManageTables: boolean;
  canManageFloorPlan: boolean;
  canManageStaff: boolean;
}

@Injectable()
export class PlatformLocationAccessService {
  constructor(private readonly database: DatabaseService) {}

  async list(
    organizationId: string,
    membershipId: string,
  ): Promise<PlatformLocationAccessRow[]> {
    await this.requireMembership(organizationId, membershipId);
    const result = await this.database.pool.query<PlatformLocationAccessRow>(
      `SELECT l.id AS "locationId", l.code AS "locationCode", l.name AS "locationName",
        COALESCE(oml.active,FALSE) AS active,
        COALESCE(oml.can_manage_location,FALSE) AS "canManageLocation",
        COALESCE(oml.can_manage_events,FALSE) AS "canManageEvents",
        COALESCE(oml.can_manage_tables,FALSE) AS "canManageTables",
        COALESCE(oml.can_manage_floor_plan,FALSE) AS "canManageFloorPlan",
        COALESCE(oml.can_manage_staff,FALSE) AS "canManageStaff"
       FROM locations l
       LEFT JOIN organization_membership_locations oml
         ON oml.location_id=l.id AND oml.membership_id=$2
       WHERE l.organization_id=$1
       ORDER BY l.name`,
      [organizationId, membershipId],
    );
    return result.rows;
  }

  async replace(
    auth: AuthContext,
    organizationId: string,
    membershipId: string,
    dto: ReplacePlatformLocationAccessDto,
  ) {
    const membership = await this.requireMembership(
      organizationId,
      membershipId,
    );
    if (membership.role === 'OWNER' || membership.role === 'ADMIN') {
      throw new BadRequestException({
        code: 'GLOBAL_ROLE_DOES_NOT_NEED_LOCATION_SCOPE',
        message: 'OWNER e ADMIN hanno già accesso globale al tenant.',
      });
    }

    const ids = dto.assignments.map((item) => item.locationId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException({
        code: 'DUPLICATE_LOCATION_ASSIGNMENT',
        message: 'Ogni location può essere assegnata una sola volta.',
      });
    }

    await this.withTransaction(async (client) => {
      if (ids.length > 0) {
        const result = await client.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM locations
           WHERE organization_id=$1 AND id=ANY($2::uuid[])`,
          [organizationId, ids],
        );
        if ((result.rows[0]?.count ?? 0) !== ids.length) {
          throw new NotFoundException({
            code: 'LOCATION_NOT_FOUND',
            message: 'Una o più location non appartengono al tenant.',
          });
        }
      }

      await client.query(
        `UPDATE organization_membership_locations
         SET active=FALSE, updated_at=NOW()
         WHERE organization_id=$1 AND membership_id=$2`,
        [organizationId, membershipId],
      );

      for (const item of dto.assignments) {
        await client.query(
          `INSERT INTO organization_membership_locations (
             id,organization_id,membership_id,location_id,
             can_manage_location,can_manage_events,can_manage_tables,
             can_manage_floor_plan,can_manage_staff,active,created_by_user_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,$10)
           ON CONFLICT (membership_id,location_id) DO UPDATE SET
             can_manage_location=EXCLUDED.can_manage_location,
             can_manage_events=EXCLUDED.can_manage_events,
             can_manage_tables=EXCLUDED.can_manage_tables,
             can_manage_floor_plan=EXCLUDED.can_manage_floor_plan,
             can_manage_staff=EXCLUDED.can_manage_staff,
             active=TRUE,updated_at=NOW()`,
          [
            randomUUID(),
            organizationId,
            membershipId,
            item.locationId,
            item.canManageLocation,
            item.canManageEvents,
            item.canManageTables,
            item.canManageFloorPlan,
            item.canManageStaff,
            auth.userId,
          ],
        );
      }

      await client.query(
        `UPDATE organization_memberships SET default_location_id=$3,updated_at=NOW()
         WHERE organization_id=$1 AND id=$2`,
        [organizationId, membershipId, dto.assignments[0]?.locationId ?? null],
      );
    });

    return this.list(organizationId, membershipId);
  }

  private async requireMembership(
    organizationId: string,
    membershipId: string,
  ) {
    const result = await this.database.pool.query<MembershipRow>(
      `SELECT id,role::text FROM organization_memberships
       WHERE id=$1 AND organization_id=$2 LIMIT 1`,
      [membershipId, organizationId],
    );
    const membership = result.rows[0];
    if (!membership) {
      throw new NotFoundException({
        code: 'MEMBERSHIP_NOT_FOUND',
        message: 'Membro non trovato nel tenant.',
      });
    }
    return membership;
  }

  private async withTransaction<T>(work: (client: PoolClient) => Promise<T>) {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
