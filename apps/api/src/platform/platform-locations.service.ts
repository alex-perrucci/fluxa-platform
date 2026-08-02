import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import type {
  CreatePlatformLocationDto,
  UpdatePlatformLocationDto,
} from './dto/platform-location.dto';

interface CountRow extends QueryResultRow {
  count: number;
}

interface LocationRow extends QueryResultRow {
  id: string;
  organizationId: string;
  merchantId: string;
  merchantLegalName: string;
  code: string;
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  postalCode: string;
  city: string;
  province: string | null;
  countryCode: string;
  timezone: string;
  status: 'ACTIVE' | 'INACTIVE';
  kind: 'PERMANENT' | 'TEMPORARY';
  lifecycleStatus: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  activeFrom: Date | null;
  activeUntil: Date | null;
  sourceLocationId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AreaRow extends QueryResultRow {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  status: 'ACTIVE' | 'INACTIVE';
}

interface TableRow extends QueryResultRow {
  code: string;
  name: string;
  capacity: number;
  sortOrder: number;
  status: 'ACTIVE' | 'INACTIVE';
}

@Injectable()
export class PlatformLocationsService {
  constructor(private readonly database: DatabaseService) {}

  async list(organizationId: string) {
    await this.requireOrganization(organizationId);
    const result = await this.database.pool.query<LocationRow>(
      `${this.locationSelect()}
       WHERE l.organization_id=$1
       ORDER BY
         CASE ll.lifecycle_status WHEN 'ACTIVE' THEN 0 WHEN 'INACTIVE' THEN 1 ELSE 2 END,
         l.name`,
      [organizationId],
    );
    return result.rows;
  }

  async get(organizationId: string, locationId: string) {
    const result = await this.database.pool.query<LocationRow>(
      `${this.locationSelect()}
       WHERE l.organization_id=$1 AND l.id=$2
       LIMIT 1`,
      [organizationId, locationId],
    );
    const location = result.rows[0];
    if (!location) {
      throw new NotFoundException({
        code: 'LOCATION_NOT_FOUND',
        message: 'Location non trovata per questa organizzazione.',
      });
    }
    return location;
  }

  async create(
    auth: AuthContext,
    organizationId: string,
    dto: CreatePlatformLocationDto,
  ) {
    this.assertWindow(dto.kind, dto.activeFrom, dto.activeUntil);
    const copy = dto.copy ?? {
      layout: false,
      catalog: false,
      priceLists: false,
      fiscalProfile: false,
    };
    if (
      (copy.layout || copy.catalog || copy.priceLists || copy.fiscalProfile) &&
      !dto.sourceLocationId
    ) {
      throw new BadRequestException({
        code: 'SOURCE_LOCATION_REQUIRED',
        message:
          'Seleziona una location sorgente per copiare le configurazioni.',
      });
    }

    try {
      const locationId = await this.withTransaction(async (client) => {
        await this.requireOrganization(organizationId, client);
        await this.requireMerchant(organizationId, dto.merchantId, client);
        if (dto.sourceLocationId) {
          const source = await this.requireLocation(
            organizationId,
            dto.sourceLocationId,
            client,
          );
          if (source.merchantId !== dto.merchantId) {
            throw new BadRequestException({
              code: 'SOURCE_MERCHANT_MISMATCH',
              message:
                'La location sorgente deve usare lo stesso merchant fiscale.',
            });
          }
        }

        const id = randomUUID();
        await client.query(
          `INSERT INTO locations (
             id, organization_id, merchant_id, code, name, address_line_1,
             address_line_2, postal_code, city, province, country_code,
             timezone, status
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'ACTIVE')`,
          [
            id,
            organizationId,
            dto.merchantId,
            dto.code.trim().toUpperCase(),
            dto.name.trim(),
            dto.addressLine1.trim(),
            dto.addressLine2?.trim() || null,
            dto.postalCode.trim(),
            dto.city.trim(),
            dto.province?.trim().toUpperCase() || null,
            (dto.countryCode ?? 'IT').trim().toUpperCase(),
            dto.timezone?.trim() || 'Europe/Rome',
          ],
        );
        await client.query(
          `INSERT INTO location_lifecycle (
             location_id, organization_id, kind, lifecycle_status,
             active_from, active_until, source_location_id
           ) VALUES ($1,$2,$3,'ACTIVE',$4,$5,$6)`,
          [
            id,
            organizationId,
            dto.kind,
            dto.activeFrom ? new Date(dto.activeFrom) : null,
            dto.activeUntil ? new Date(dto.activeUntil) : null,
            dto.sourceLocationId ?? null,
          ],
        );

        if (dto.sourceLocationId && copy.layout) {
          await this.copyLayout(
            client,
            organizationId,
            dto.sourceLocationId,
            id,
          );
        }
        if (dto.sourceLocationId && copy.catalog) {
          await client.query(
            `INSERT INTO location_products (
               id, organization_id, location_id, product_id, enabled, sort_order
             )
             SELECT gen_random_uuid(), organization_id, $3, product_id, enabled, sort_order
             FROM location_products
             WHERE organization_id=$1 AND location_id=$2`,
            [organizationId, dto.sourceLocationId, id],
          );
        }
        if (dto.sourceLocationId && copy.priceLists) {
          await client.query(
            `INSERT INTO location_price_lists (
               id, organization_id, location_id, price_list_id, priority, active
             )
             SELECT gen_random_uuid(), organization_id, $3, price_list_id, priority, active
             FROM location_price_lists
             WHERE organization_id=$1 AND location_id=$2`,
            [organizationId, dto.sourceLocationId, id],
          );
        }
        if (dto.sourceLocationId && copy.fiscalProfile) {
          await client.query(
            `INSERT INTO fiscal_profiles (
               id, organization_id, location_id, provider, environment, fiscal_id,
               enabled, auto_issue_on_paid, receipt_email, display_name, version
             )
             SELECT gen_random_uuid(), organization_id, $3, provider, environment,
               fiscal_id, FALSE, FALSE, receipt_email, display_name, 1
             FROM fiscal_profiles
             WHERE organization_id=$1 AND location_id=$2`,
            [organizationId, dto.sourceLocationId, id],
          );
        }

        await this.audit(client, organizationId, auth.userId, id, 'created', {
          kind: dto.kind,
          sourceLocationId: dto.sourceLocationId ?? null,
          copied: copy,
        });
        return id;
      });
      return this.get(organizationId, locationId);
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(
    auth: AuthContext,
    organizationId: string,
    locationId: string,
    dto: UpdatePlatformLocationDto,
  ) {
    const current = await this.get(organizationId, locationId);
    if (current.lifecycleStatus === 'ARCHIVED') {
      throw new ConflictException({
        code: 'LOCATION_ARCHIVED',
        message: 'Una location archiviata non può essere modificata.',
      });
    }
    const kind = dto.kind ?? current.kind;
    const activeFrom = dto.activeFrom ?? current.activeFrom?.toISOString();
    const activeUntil = dto.activeUntil ?? current.activeUntil?.toISOString();
    this.assertWindow(kind, activeFrom, activeUntil);

    try {
      await this.withTransaction(async (client) => {
        await this.requireLocation(organizationId, locationId, client);
        await client.query(
          `UPDATE locations SET
             code=COALESCE($3,code), name=COALESCE($4,name),
             address_line_1=COALESCE($5,address_line_1),
             address_line_2=CASE WHEN $6::boolean THEN $7 ELSE address_line_2 END,
             postal_code=COALESCE($8,postal_code), city=COALESCE($9,city),
             province=CASE WHEN $10::boolean THEN $11 ELSE province END,
             country_code=COALESCE($12,country_code),
             timezone=COALESCE($13,timezone), updated_at=NOW()
           WHERE id=$1 AND organization_id=$2`,
          [
            locationId,
            organizationId,
            dto.code?.trim().toUpperCase() ?? null,
            dto.name?.trim() ?? null,
            dto.addressLine1?.trim() ?? null,
            dto.addressLine2 !== undefined,
            dto.addressLine2?.trim() || null,
            dto.postalCode?.trim() ?? null,
            dto.city?.trim() ?? null,
            dto.province !== undefined,
            dto.province?.trim().toUpperCase() || null,
            dto.countryCode?.trim().toUpperCase() ?? null,
            dto.timezone?.trim() ?? null,
          ],
        );
        await client.query(
          `UPDATE location_lifecycle SET
             kind=$3, active_from=$4, active_until=$5, updated_at=NOW()
           WHERE location_id=$1 AND organization_id=$2`,
          [
            locationId,
            organizationId,
            kind,
            activeFrom ? new Date(activeFrom) : null,
            activeUntil ? new Date(activeUntil) : null,
          ],
        );
        await this.audit(
          client,
          organizationId,
          auth.userId,
          locationId,
          'updated',
          {
            kind,
          },
        );
      });
      return this.get(organizationId, locationId);
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async setActive(
    auth: AuthContext,
    organizationId: string,
    locationId: string,
    status: 'ACTIVE' | 'INACTIVE',
  ) {
    const current = await this.get(organizationId, locationId);
    if (current.lifecycleStatus === 'ARCHIVED') {
      throw new ConflictException({
        code: 'LOCATION_ARCHIVED',
        message: 'Una location archiviata non può essere riattivata.',
      });
    }
    if (status === 'INACTIVE') {
      await this.assertCanStop(organizationId, locationId);
    }
    await this.withTransaction(async (client) => {
      await client.query(
        `UPDATE locations SET status=$3::location_status, updated_at=NOW()
         WHERE id=$1 AND organization_id=$2`,
        [locationId, organizationId, status],
      );
      await client.query(
        `UPDATE location_lifecycle SET lifecycle_status=$3::location_lifecycle_status,
           updated_at=NOW()
         WHERE location_id=$1 AND organization_id=$2`,
        [locationId, organizationId, status],
      );
      await this.audit(
        client,
        organizationId,
        auth.userId,
        locationId,
        status === 'ACTIVE' ? 'activated' : 'deactivated',
        {},
      );
    });
    return this.get(organizationId, locationId);
  }

  async archive(auth: AuthContext, organizationId: string, locationId: string) {
    const current = await this.get(organizationId, locationId);
    if (current.lifecycleStatus === 'ARCHIVED') return current;
    await this.assertCanStop(organizationId, locationId);
    await this.withTransaction(async (client) => {
      await client.query(
        `UPDATE locations SET status='INACTIVE', updated_at=NOW()
         WHERE id=$1 AND organization_id=$2`,
        [locationId, organizationId],
      );
      await client.query(
        `UPDATE location_lifecycle SET lifecycle_status='ARCHIVED',
           archived_at=NOW(), archived_by_user_id=$3, updated_at=NOW()
         WHERE location_id=$1 AND organization_id=$2`,
        [locationId, organizationId, auth.userId],
      );
      await this.audit(
        client,
        organizationId,
        auth.userId,
        locationId,
        'archived',
        {},
      );
    });
    return this.get(organizationId, locationId);
  }

  private async copyLayout(
    client: PoolClient,
    organizationId: string,
    sourceLocationId: string,
    targetLocationId: string,
  ) {
    const areas = await client.query<AreaRow>(
      `SELECT id, code, name, sort_order AS "sortOrder", status
       FROM dining_areas
       WHERE organization_id=$1 AND location_id=$2
       ORDER BY sort_order, name`,
      [organizationId, sourceLocationId],
    );
    for (const area of areas.rows) {
      const areaId = randomUUID();
      await client.query(
        `INSERT INTO dining_areas (
           id, organization_id, location_id, code, name, sort_order, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          areaId,
          organizationId,
          targetLocationId,
          area.code,
          area.name,
          area.sortOrder,
          area.status,
        ],
      );
      const tables = await client.query<TableRow>(
        `SELECT code, name, capacity, sort_order AS "sortOrder", status
         FROM dining_tables
         WHERE organization_id=$1 AND location_id=$2 AND area_id=$3
         ORDER BY sort_order, name`,
        [organizationId, sourceLocationId, area.id],
      );
      for (const table of tables.rows) {
        await client.query(
          `INSERT INTO dining_tables (
             id, organization_id, location_id, area_id, code, name,
             capacity, sort_order, status
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            randomUUID(),
            organizationId,
            targetLocationId,
            areaId,
            table.code,
            table.name,
            table.capacity,
            table.sortOrder,
            table.status,
          ],
        );
      }
    }
  }

  private async assertCanStop(organizationId: string, locationId: string) {
    const result = await this.database.pool.query<CountRow>(
      `SELECT (
         (SELECT COUNT(*) FROM table_sessions
          WHERE organization_id=$1 AND location_id=$2 AND status='OPEN') +
         (SELECT COUNT(*) FROM events
          WHERE organization_id=$1 AND location_id=$2
            AND status IN ('PUBLISHED','SOLD_OUT'))
       )::int AS count`,
      [organizationId, locationId],
    );
    if ((result.rows[0]?.count ?? 0) > 0) {
      throw new ConflictException({
        code: 'LOCATION_HAS_ACTIVE_OPERATIONS',
        message:
          'Chiudi i tavoli occupati e annulla/completa gli eventi pubblicati prima di fermare la location.',
      });
    }
  }

  private async requireOrganization(
    organizationId: string,
    client: PoolClient | DatabaseService['pool'] = this.database.pool,
  ) {
    const result = await client.query(
      'SELECT id FROM organizations WHERE id=$1 LIMIT 1',
      [organizationId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException({
        code: 'ORGANIZATION_NOT_FOUND',
        message: 'Organizzazione non trovata.',
      });
    }
  }

  private async requireMerchant(
    organizationId: string,
    merchantId: string,
    client: PoolClient,
  ) {
    const result = await client.query(
      `SELECT id FROM merchants
       WHERE id=$1 AND organization_id=$2 AND status='ACTIVE' LIMIT 1`,
      [merchantId, organizationId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException({
        code: 'MERCHANT_NOT_FOUND',
        message: 'Merchant fiscale attivo non trovato.',
      });
    }
  }

  private async requireLocation(
    organizationId: string,
    locationId: string,
    client: PoolClient,
  ) {
    const result = await client.query<{ id: string; merchantId: string }>(
      `SELECT id, merchant_id AS "merchantId" FROM locations
       WHERE id=$1 AND organization_id=$2 LIMIT 1`,
      [locationId, organizationId],
    );
    const location = result.rows[0];
    if (!location) {
      throw new NotFoundException({
        code: 'LOCATION_NOT_FOUND',
        message: 'Location non trovata.',
      });
    }
    return location;
  }

  private assertWindow(
    kind: 'PERMANENT' | 'TEMPORARY',
    activeFrom?: string,
    activeUntil?: string,
  ) {
    if (kind === 'TEMPORARY' && (!activeFrom || !activeUntil)) {
      throw new BadRequestException({
        code: 'TEMPORARY_LOCATION_WINDOW_REQUIRED',
        message: 'Una location temporanea richiede data di inizio e fine.',
      });
    }
    if (
      activeFrom &&
      activeUntil &&
      new Date(activeUntil) <= new Date(activeFrom)
    ) {
      throw new BadRequestException({
        code: 'INVALID_LOCATION_WINDOW',
        message: 'La fine della location deve essere successiva all’inizio.',
      });
    }
  }

  private async audit(
    client: PoolClient,
    organizationId: string,
    actorUserId: string,
    locationId: string,
    action: string,
    payload: Record<string, unknown>,
  ) {
    await client.query(
      `INSERT INTO audit_events (
         id, organization_id, actor_user_id, action, entity_type, entity_id, payload
       ) VALUES ($1,$2,$3,$4,'location',$5,$6::jsonb)`,
      [
        randomUUID(),
        organizationId,
        actorUserId,
        `platform.location.${action}`,
        locationId,
        JSON.stringify(payload),
      ],
    );
  }

  private locationSelect() {
    return `SELECT
      l.id, l.organization_id AS "organizationId",
      l.merchant_id AS "merchantId", m.legal_name AS "merchantLegalName",
      l.code, l.name, l.address_line_1 AS "addressLine1",
      l.address_line_2 AS "addressLine2", l.postal_code AS "postalCode",
      l.city, l.province, l.country_code AS "countryCode", l.timezone,
      l.status, ll.kind, ll.lifecycle_status AS "lifecycleStatus",
      ll.active_from AS "activeFrom", ll.active_until AS "activeUntil",
      ll.source_location_id AS "sourceLocationId",
      ll.archived_at AS "archivedAt", l.created_at AS "createdAt",
      l.updated_at AS "updatedAt"
    FROM locations l
    JOIN merchants m ON m.id=l.merchant_id
    JOIN location_lifecycle ll ON ll.location_id=l.id`;
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

  private rethrowUnique(error: unknown): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    ) {
      throw new ConflictException({
        code: 'LOCATION_CONFLICT',
        message: 'Codice location o configurazione copiata già presente.',
      });
    }
    throw error;
  }
}
