import { Injectable } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { HospitalityAccessService } from './hospitality-access.service';

interface CategoryRouteRow extends QueryResultRow {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  categoryStatus: 'ACTIVE' | 'INACTIVE';
  stationId: string;
  stationCode: string;
  stationName: string;
  stationStatus: 'ACTIVE' | 'INACTIVE';
}

@Injectable()
export class KitchenConfigurationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: HospitalityAccessService,
  ) {}

  async listCategoryRoutes(auth: AuthContext, locationId: string) {
    const scope = await this.access.assertLocation(auth, locationId);
    const result = await this.database.pool.query<CategoryRouteRow>(
      `
        SELECT
          ksc.category_id AS "categoryId",
          c.code AS "categoryCode",
          c.name AS "categoryName",
          c.status AS "categoryStatus",
          ksc.station_id AS "stationId",
          ks.code AS "stationCode",
          ks.name AS "stationName",
          ks.status AS "stationStatus"
        FROM kitchen_station_categories ksc
        JOIN categories c
          ON c.id = ksc.category_id
          AND c.organization_id = ksc.organization_id
        JOIN kitchen_stations ks
          ON ks.id = ksc.station_id
          AND ks.organization_id = ksc.organization_id
        WHERE ksc.organization_id = $1
          AND ksc.location_id = $2
        ORDER BY c.sort_order, c.name, c.id
      `,
      [scope.organizationId, locationId],
    );
    return result.rows;
  }
}
