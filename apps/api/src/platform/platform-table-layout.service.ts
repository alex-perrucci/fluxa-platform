import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import type { PlatformTableLayoutDto } from './dto/platform-table-layout.dto';

interface LocationRow extends QueryResultRow {
  id: string;
  organizationId: string;
  name: string;
}

interface AreaRow extends QueryResultRow {
  id: string;
  locationId: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
}

interface TableRow extends QueryResultRow {
  id: string;
  locationId: string;
  areaId: string;
  code: string;
  name: string;
  capacity: number;
  sortOrder: number;
  status: 'ACTIVE' | 'INACTIVE';
}

@Injectable()
export class PlatformTableLayoutService {
  constructor(private readonly database: DatabaseService) {}

  async get(organizationId: string, locationId: string) {
    const location = await this.requireLocation(organizationId, locationId);
    const areas = await this.database.pool.query<AreaRow>(
      `SELECT id, location_id AS "locationId", code, name, status
       FROM dining_areas
       WHERE organization_id=$1 AND location_id=$2
       ORDER BY sort_order, name`,
      [organizationId, locationId],
    );
    const tables = await this.database.pool.query<TableRow>(
      `SELECT id, location_id AS "locationId", area_id AS "areaId", code, name,
         capacity, sort_order AS "sortOrder", status
       FROM dining_tables
       WHERE organization_id=$1 AND location_id=$2
       ORDER BY sort_order, name`,
      [organizationId, locationId],
    );

    return { location, areas: areas.rows, tables: tables.rows };
  }

  async replace(
    auth: AuthContext,
    organizationId: string,
    dto: PlatformTableLayoutDto,
  ) {
    const normalized = dto.tables.map((table, index) => ({
      id: table.id,
      code: table.code.trim().toUpperCase(),
      name: table.name.trim(),
      capacity: table.capacity,
      sortOrder: index,
    }));
    const codes = normalized.map((table) => table.code);
    if (new Set(codes).size !== codes.length) {
      throw new ConflictException({
        code: 'DINING_TABLE_CODE_EXISTS',
        message: 'I codici dei tavoli devono essere univoci nella sede.',
      });
    }

    return this.withTransaction(async (client) => {
      await this.requireLocation(organizationId, dto.locationId, client);
      const area = await client.query<AreaRow>(
        `SELECT id, location_id AS "locationId", code, name, status
         FROM dining_areas
         WHERE id=$1 AND organization_id=$2 AND location_id=$3
         LIMIT 1`,
        [dto.areaId, organizationId, dto.locationId],
      );
      if (!area.rows[0]) {
        throw new NotFoundException({
          code: 'DINING_AREA_NOT_FOUND',
          message: 'Sala non trovata per questa sede.',
        });
      }

      const current = await client.query<TableRow>(
        `SELECT id, location_id AS "locationId", area_id AS "areaId", code, name,
           capacity, sort_order AS "sortOrder", status
         FROM dining_tables
         WHERE organization_id=$1 AND location_id=$2
         FOR UPDATE`,
        [organizationId, dto.locationId],
      );
      const currentById = new Map(current.rows.map((table) => [table.id, table]));
      const retainedIds = new Set<string>();

      for (const table of normalized) {
        if (table.id) {
          const existing = currentById.get(table.id);
          if (!existing) {
            throw new NotFoundException({
              code: 'DINING_TABLE_NOT_FOUND',
              message: `Il tavolo ${table.code} non appartiene a questa sede.`,
            });
          }
          retainedIds.add(table.id);
          await client.query(
            `UPDATE dining_tables
             SET area_id=$4, code=$5, name=$6, capacity=$7, sort_order=$8,
                 status='ACTIVE', updated_at=NOW()
             WHERE id=$1 AND organization_id=$2 AND location_id=$3`,
            [
              table.id,
              organizationId,
              dto.locationId,
              dto.areaId,
              table.code,
              table.name,
              table.capacity,
              table.sortOrder,
            ],
          );
        } else {
          const id = randomUUID();
          retainedIds.add(id);
          await client.query(
            `INSERT INTO dining_tables (
               id, organization_id, location_id, area_id, code, name,
               capacity, sort_order, status
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE')`,
            [
              id,
              organizationId,
              dto.locationId,
              dto.areaId,
              table.code,
              table.name,
              table.capacity,
              table.sortOrder,
            ],
          );
        }
      }

      const removed = current.rows.filter((table) => !retainedIds.has(table.id));
      for (const table of removed) {
        const openSession = await client.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count
           FROM table_sessions
           WHERE organization_id=$1 AND table_id=$2 AND status='OPEN'`,
          [organizationId, table.id],
        );
        if ((openSession.rows[0]?.count ?? 0) > 0) {
          throw new ConflictException({
            code: 'TABLE_HAS_OPEN_SESSION',
            message: `Il tavolo ${table.code} è occupato e non può essere rimosso.`,
          });
        }
        await client.query(
          `UPDATE dining_tables
           SET status='INACTIVE', updated_at=NOW()
           WHERE id=$1 AND organization_id=$2`,
          [table.id, organizationId],
        );
      }

      await client.query(
        `INSERT INTO audit_events (
           id, organization_id, actor_user_id, action, entity_type, entity_id, payload
         ) VALUES ($1,$2,$3,'platform.table_layout.updated','location',$4,$5::jsonb)`,
        [
          randomUUID(),
          organizationId,
          auth.userId,
          dto.locationId,
          JSON.stringify({ tableCount: normalized.length, areaId: dto.areaId }),
        ],
      );

      return this.get(organizationId, dto.locationId);
    });
  }

  private async requireLocation(
    organizationId: string,
    locationId: string,
    client: PoolClient | DatabaseService['pool'] = this.database.pool,
  ) {
    const result = await client.query<LocationRow>(
      `SELECT id, organization_id AS "organizationId", name
       FROM locations
       WHERE id=$1 AND organization_id=$2
       LIMIT 1`,
      [locationId, organizationId],
    );
    const location = result.rows[0];
    if (!location) {
      throw new NotFoundException({
        code: 'LOCATION_NOT_FOUND',
        message: 'Sede non trovata per questa organizzazione.',
      });
    }
    return location;
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
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === '23505'
      ) {
        throw new ConflictException({
          code: 'DINING_TABLE_CODE_EXISTS',
          message: 'Un codice tavolo è già utilizzato nella sede.',
        });
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
