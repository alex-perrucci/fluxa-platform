import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import { LocationAccessService } from '../auth/location-access.service';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import type { PublishFloorPlanDto } from './dto/publish-floor-plan.dto';
import type { SaveFloorPlanDraftDto } from './dto/save-floor-plan-draft.dto';
import {
  emptyFloorPlanDocument,
  floorPlanTableIds,
  validateFloorPlanDocument,
  type FloorPlanDocument,
} from './floor-plan-document';

interface FloorPlanRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  name: string;
  publishedVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FloorPlanVersionRow extends QueryResultRow {
  id: string;
  floorPlanId: string;
  versionNumber: number;
  revision: number;
  status: 'DRAFT' | 'PUBLISHED';
  document: FloorPlanDocument;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FloorPlanVersionSummaryRow extends QueryResultRow {
  id: string;
  versionNumber: number;
  revision: number;
  status: 'DRAFT' | 'PUBLISHED';
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FloorPlanTableRow extends QueryResultRow {
  id: string;
  areaId: string;
  areaName: string;
  code: string;
  name: string;
  capacity: number;
  status: 'ACTIVE' | 'INACTIVE';
}

@Injectable()
export class FloorPlansService {
  constructor(
    private readonly database: DatabaseService,
    private readonly locationAccess: LocationAccessService,
  ) {}

  async get(auth: AuthContext, locationId: string) {
    const access = await this.locationAccess.assert(
      auth,
      locationId,
      'manage_floor_plan',
    );
    return this.getScoped(access.organizationId, locationId, auth.userId);
  }

  async saveDraft(
    auth: AuthContext,
    locationId: string,
    dto: SaveFloorPlanDraftDto,
  ) {
    const access = await this.locationAccess.assert(
      auth,
      locationId,
      'manage_floor_plan',
    );
    return this.saveDraftScoped(
      access.organizationId,
      locationId,
      auth.userId,
      dto,
    );
  }

  async publish(
    auth: AuthContext,
    locationId: string,
    dto: PublishFloorPlanDto,
  ) {
    const access = await this.locationAccess.assert(
      auth,
      locationId,
      'manage_floor_plan',
    );
    return this.publishScoped(
      access.organizationId,
      locationId,
      auth.userId,
      dto,
    );
  }

  async getForPlatform(
    auth: AuthContext,
    organizationId: string,
    locationId: string,
  ) {
    return this.getScoped(organizationId, locationId, auth.userId);
  }

  async saveDraftForPlatform(
    auth: AuthContext,
    organizationId: string,
    locationId: string,
    dto: SaveFloorPlanDraftDto,
  ) {
    return this.saveDraftScoped(
      organizationId,
      locationId,
      auth.userId,
      dto,
    );
  }

  async publishForPlatform(
    auth: AuthContext,
    organizationId: string,
    locationId: string,
    dto: PublishFloorPlanDto,
  ) {
    return this.publishScoped(
      organizationId,
      locationId,
      auth.userId,
      dto,
    );
  }

  private async getScoped(
    organizationId: string,
    locationId: string,
    actorUserId: string,
  ) {
    await this.ensureFloorPlan(organizationId, locationId, actorUserId);

    const [planResult, draftResult, publishedResult, versionsResult, tablesResult] =
      await Promise.all([
        this.database.pool.query<FloorPlanRow>(
          `${this.planSelect()}
           WHERE fp.organization_id=$1 AND fp.location_id=$2
           LIMIT 1`,
          [organizationId, locationId],
        ),
        this.database.pool.query<FloorPlanVersionRow>(
          `${this.versionSelect()}
           WHERE fpv.organization_id=$1 AND fpv.location_id=$2
             AND fpv.status='DRAFT'
           LIMIT 1`,
          [organizationId, locationId],
        ),
        this.database.pool.query<FloorPlanVersionRow>(
          `${this.versionSelect()}
           JOIN floor_plans fp ON fp.published_version_id=fpv.id
           WHERE fp.organization_id=$1 AND fp.location_id=$2
           LIMIT 1`,
          [organizationId, locationId],
        ),
        this.database.pool.query<FloorPlanVersionSummaryRow>(
          `SELECT id, version_number AS "versionNumber", revision, status,
             published_at AS "publishedAt", created_at AS "createdAt",
             updated_at AS "updatedAt"
           FROM floor_plan_versions
           WHERE organization_id=$1 AND location_id=$2
           ORDER BY version_number DESC`,
          [organizationId, locationId],
        ),
        this.database.pool.query<FloorPlanTableRow>(
          `SELECT t.id, t.area_id AS "areaId", a.name AS "areaName",
             t.code, t.name, t.capacity, t.status
           FROM dining_tables t
           JOIN dining_areas a ON a.id=t.area_id
           WHERE t.organization_id=$1 AND t.location_id=$2
           ORDER BY a.sort_order, t.sort_order, t.name`,
          [organizationId, locationId],
        ),
      ]);

    const plan = planResult.rows[0];
    const draft = draftResult.rows[0];
    if (!plan || !draft) {
      throw new Error('Floor plan initialization returned no draft.');
    }

    return {
      plan,
      draft,
      published: publishedResult.rows[0] ?? null,
      versions: versionsResult.rows,
      tables: tablesResult.rows,
    };
  }

  private async saveDraftScoped(
    organizationId: string,
    locationId: string,
    actorUserId: string,
    dto: SaveFloorPlanDraftDto,
  ) {
    const document = validateFloorPlanDocument(dto.document);
    await this.assertTableReferences(organizationId, locationId, document);
    await this.ensureFloorPlan(organizationId, locationId, actorUserId);

    await this.withTransaction(async (client) => {
      const result = await client.query<FloorPlanVersionRow>(
        `UPDATE floor_plan_versions
         SET document=$4::jsonb, revision=revision+1, updated_at=NOW()
         WHERE organization_id=$1 AND location_id=$2
           AND status='DRAFT' AND revision=$3
         RETURNING id, floor_plan_id AS "floorPlanId",
           version_number AS "versionNumber", revision, status, document,
           published_at AS "publishedAt", created_at AS "createdAt",
           updated_at AS "updatedAt"`,
        [organizationId, locationId, dto.revision, JSON.stringify(document)],
      );

      const saved = result.rows[0];
      if (!saved) {
        throw new ConflictException({
          code: 'FLOOR_PLAN_REVISION_CONFLICT',
          message:
            'La piantina è stata modificata in un’altra sessione. Ricarica prima di salvare.',
        });
      }

      await this.audit(client, {
        organizationId,
        actorUserId,
        locationId,
        versionId: saved.id,
        action: 'floor_plan.draft_saved',
        payload: {
          versionNumber: saved.versionNumber,
          revision: saved.revision,
          elementCount: document.elements.length,
        },
      });
    });

    return this.getScoped(organizationId, locationId, actorUserId);
  }

  private async publishScoped(
    organizationId: string,
    locationId: string,
    actorUserId: string,
    dto: PublishFloorPlanDto,
  ) {
    await this.ensureFloorPlan(organizationId, locationId, actorUserId);

    await this.withTransaction(async (client) => {
      const plan = await this.requirePlan(
        client,
        organizationId,
        locationId,
        true,
      );
      const draftResult = await client.query<FloorPlanVersionRow>(
        `${this.versionSelect()}
         WHERE fpv.floor_plan_id=$1 AND fpv.status='DRAFT'
         FOR UPDATE`,
        [plan.id],
      );
      const draft = draftResult.rows[0];
      if (!draft) {
        throw new NotFoundException({
          code: 'FLOOR_PLAN_DRAFT_NOT_FOUND',
          message: 'Bozza della piantina non trovata.',
        });
      }
      if (draft.revision !== dto.revision) {
        throw new ConflictException({
          code: 'FLOOR_PLAN_REVISION_CONFLICT',
          message:
            'La piantina è stata modificata in un’altra sessione. Ricarica prima di pubblicare.',
        });
      }

      const document = validateFloorPlanDocument(draft.document);
      await this.assertTableReferences(
        organizationId,
        locationId,
        document,
        client,
      );

      await client.query(
        `UPDATE floor_plan_versions
         SET status='PUBLISHED', published_at=NOW(),
           published_by_user_id=$2, updated_at=NOW()
         WHERE id=$1`,
        [draft.id, actorUserId],
      );
      await client.query(
        `UPDATE floor_plans
         SET published_version_id=$2, updated_at=NOW()
         WHERE id=$1`,
        [plan.id, draft.id],
      );

      const nextVersionNumber = draft.versionNumber + 1;
      const nextDraftId = randomUUID();
      await client.query(
        `INSERT INTO floor_plan_versions (
           id, floor_plan_id, organization_id, location_id, version_number,
           revision, status, document, created_by_user_id
         ) VALUES ($1,$2,$3,$4,$5,1,'DRAFT',$6::jsonb,$7)`,
        [
          nextDraftId,
          plan.id,
          organizationId,
          locationId,
          nextVersionNumber,
          JSON.stringify(document),
          actorUserId,
        ],
      );

      await this.audit(client, {
        organizationId,
        actorUserId,
        locationId,
        versionId: draft.id,
        action: 'floor_plan.published',
        payload: {
          publishedVersionNumber: draft.versionNumber,
          nextDraftVersionNumber: nextVersionNumber,
          elementCount: document.elements.length,
        },
      });
    });

    return this.getScoped(organizationId, locationId, actorUserId);
  }

  private async ensureFloorPlan(
    organizationId: string,
    locationId: string,
    actorUserId: string,
  ) {
    await this.withTransaction(async (client) => {
      await this.requireLocation(client, organizationId, locationId);
      await client.query(
        `INSERT INTO floor_plans (
           id, organization_id, location_id, name, created_by_user_id
         ) VALUES ($1,$2,$3,'Piantina principale',$4)
         ON CONFLICT (organization_id,location_id) DO NOTHING`,
        [randomUUID(), organizationId, locationId, actorUserId],
      );
      const plan = await this.requirePlan(
        client,
        organizationId,
        locationId,
        true,
      );
      const draft = await client.query<{ id: string }>(
        `SELECT id FROM floor_plan_versions
         WHERE floor_plan_id=$1 AND status='DRAFT'
         LIMIT 1`,
        [plan.id],
      );
      if (!draft.rows[0]) {
        const versionResult = await client.query<{ nextVersion: number }>(
          `SELECT COALESCE(MAX(version_number),0)::int+1 AS "nextVersion"
           FROM floor_plan_versions
           WHERE floor_plan_id=$1`,
          [plan.id],
        );
        await client.query(
          `INSERT INTO floor_plan_versions (
             id, floor_plan_id, organization_id, location_id, version_number,
             revision, status, document, created_by_user_id
           ) VALUES ($1,$2,$3,$4,$5,1,'DRAFT',$6::jsonb,$7)`,
          [
            randomUUID(),
            plan.id,
            organizationId,
            locationId,
            versionResult.rows[0]?.nextVersion ?? 1,
            JSON.stringify(emptyFloorPlanDocument()),
            actorUserId,
          ],
        );
      }
    });
  }

  private async assertTableReferences(
    organizationId: string,
    locationId: string,
    document: FloorPlanDocument,
    client: PoolClient | DatabaseService['pool'] = this.database.pool,
  ) {
    const tableIds = floorPlanTableIds(document);
    if (tableIds.length === 0) return;

    const result = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM dining_tables
       WHERE organization_id=$1 AND location_id=$2
         AND status='ACTIVE' AND id=ANY($3::uuid[])`,
      [organizationId, locationId, tableIds],
    );
    if ((result.rows[0]?.count ?? 0) !== tableIds.length) {
      throw new NotFoundException({
        code: 'FLOOR_PLAN_TABLE_NOT_FOUND',
        message:
          'Uno o più tavoli della piantina non sono attivi nella location selezionata.',
      });
    }
  }

  private async requireLocation(
    client: PoolClient,
    organizationId: string,
    locationId: string,
  ) {
    const result = await client.query<{ id: string }>(
      `SELECT l.id
       FROM locations l
       LEFT JOIN location_lifecycle ll ON ll.location_id=l.id
       WHERE l.id=$1 AND l.organization_id=$2 AND l.status='ACTIVE'
         AND COALESCE(ll.lifecycle_status::text,l.status::text)='ACTIVE'
       LIMIT 1`,
      [locationId, organizationId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException({
        code: 'LOCATION_NOT_FOUND',
        message: 'Location attiva non trovata.',
      });
    }
  }

  private async requirePlan(
    client: PoolClient,
    organizationId: string,
    locationId: string,
    lock: boolean,
  ) {
    const result = await client.query<FloorPlanRow>(
      `${this.planSelect()}
       WHERE fp.organization_id=$1 AND fp.location_id=$2
       LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
      [organizationId, locationId],
    );
    const plan = result.rows[0];
    if (!plan) {
      throw new NotFoundException({
        code: 'FLOOR_PLAN_NOT_FOUND',
        message: 'Piantina non trovata.',
      });
    }
    return plan;
  }

  private async audit(
    client: PoolClient,
    input: {
      organizationId: string;
      actorUserId: string;
      locationId: string;
      versionId: string;
      action: string;
      payload: Record<string, unknown>;
    },
  ) {
    await client.query(
      `INSERT INTO audit_events (
         id, organization_id, actor_user_id, action,
         entity_type, entity_id, payload
       ) VALUES ($1,$2,$3,$4,'floor_plan_version',$5,$6::jsonb)`,
      [
        randomUUID(),
        input.organizationId,
        input.actorUserId,
        input.action,
        input.versionId,
        JSON.stringify({ locationId: input.locationId, ...input.payload }),
      ],
    );
  }

  private planSelect() {
    return `SELECT fp.id, fp.organization_id AS "organizationId",
      fp.location_id AS "locationId", fp.name,
      fp.published_version_id AS "publishedVersionId",
      fp.created_at AS "createdAt", fp.updated_at AS "updatedAt"
    FROM floor_plans fp`;
  }

  private versionSelect() {
    return `SELECT fpv.id, fpv.floor_plan_id AS "floorPlanId",
      fpv.version_number AS "versionNumber", fpv.revision, fpv.status,
      fpv.document, fpv.published_at AS "publishedAt",
      fpv.created_at AS "createdAt", fpv.updated_at AS "updatedAt"
    FROM floor_plan_versions fpv`;
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
