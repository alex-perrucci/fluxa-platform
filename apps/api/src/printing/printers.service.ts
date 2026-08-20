import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import type { CreatePrinterDto } from './dto/create-printer.dto';
import type { PrinterHeartbeatDto } from './dto/printer-heartbeat.dto';
import type { PrinterListQueryDto } from './dto/printer-list-query.dto';
import type { PrintRouteListQueryDto } from './dto/print-route-list-query.dto';
import type { UpdatePrinterDto } from './dto/update-printer.dto';
import type { UpsertPrintRouteDto } from './dto/upsert-print-route.dto';
import {
  assertPrinterSupportsDocument,
  buildPrintRouteKey,
} from './print-policy';
import {
  PrintingAccessService,
  type AccessiblePrinter,
} from './printing-access.service';
import type { PrintDocumentType, PrinterPurpose } from './printing.constants';

interface CountRow extends QueryResultRow {
  count: number;
}

interface RouteRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  routeKey: string;
  documentType: PrintDocumentType;
  kitchenStationId: string | null;
  kitchenStationName: string | null;
  printerId: string;
  printerCode: string;
  printerName: string;
  printerPurpose: PrinterPurpose;
  copies: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class PrintersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: PrintingAccessService,
  ) {}

  async list(auth: AuthContext, query: PrinterListQueryDto) {
    const access = await this.access.assertAdministrativeLocation(
      auth,
      query.locationId,
    );
    const offset = (query.page - 1) * query.pageSize;
    const values = [
      access.organizationId,
      query.locationId,
      query.status ?? null,
      query.pageSize,
      offset,
    ];
    const [items, count] = await Promise.all([
      this.database.pool.query<AccessiblePrinter>(
        `
          SELECT id, organization_id AS "organizationId",
            location_id AS "locationId", code, name, purpose,
            agent_device_id AS "agentDeviceId", driver,
            paper_width_mm AS "paperWidthMm",
            characters_per_line AS "charactersPerLine",
            supports_cut AS "supportsCut",
            supports_drawer AS "supportsDrawer", status,
            last_seen_at AS "lastSeenAt", agent_version AS "agentVersion",
            status_message AS "statusMessage", created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM printers
          WHERE organization_id = $1 AND location_id = $2
            AND ($3::text IS NULL OR status::text = $3)
          ORDER BY name, id
          LIMIT $4 OFFSET $5
        `,
        values,
      ),
      this.database.pool.query<CountRow>(
        `SELECT COUNT(*)::int AS count FROM printers
         WHERE organization_id=$1 AND location_id=$2
           AND ($3::text IS NULL OR status::text=$3)`,
        values.slice(0, 3),
      ),
    ]);
    return {
      page: query.page,
      pageSize: query.pageSize,
      total: count.rows[0]?.count ?? 0,
      items: items.rows,
    };
  }

  async get(auth: AuthContext, printerId: string) {
    const organizationId = assertOrganizationScope(auth);
    const printer = await this.access.printer(organizationId, printerId);
    await this.access.assertAdministrativeLocation(auth, printer.locationId);
    return printer;
  }

  async create(auth: AuthContext, dto: CreatePrinterDto) {
    const access = await this.access.assertAdministrativeLocation(
      auth,
      dto.locationId,
    );
    if (dto.agentDeviceId) {
      await this.access.assertAssignableDevice(
        access.organizationId,
        dto.locationId,
        dto.agentDeviceId,
      );
    }
    try {
      const result = await this.database.pool.query<AccessiblePrinter>(
        `
          INSERT INTO printers(
            id,organization_id,location_id,code,name,purpose,agent_device_id,
            driver,paper_width_mm,characters_per_line,supports_cut,supports_drawer
          ) VALUES($1,$2,$3,$4,$5,$6::printer_purpose,$7,$8,$9,$10,$11,$12)
          RETURNING id,organization_id AS "organizationId",
            location_id AS "locationId",code,name,purpose,
            agent_device_id AS "agentDeviceId",driver,
            paper_width_mm AS "paperWidthMm",
            characters_per_line AS "charactersPerLine",
            supports_cut AS "supportsCut",supports_drawer AS "supportsDrawer",
            status,last_seen_at AS "lastSeenAt",agent_version AS "agentVersion",
            status_message AS "statusMessage",created_at AS "createdAt",
            updated_at AS "updatedAt"
        `,
        [
          randomUUID(),
          access.organizationId,
          dto.locationId,
          dto.code.trim().toUpperCase(),
          dto.name.trim(),
          dto.purpose,
          dto.agentDeviceId ?? null,
          dto.driver?.trim() || 'ESC_POS_TEXT',
          dto.paperWidthMm ?? 80,
          dto.charactersPerLine ?? 48,
          dto.supportsCut ?? true,
          dto.supportsDrawer ?? false,
        ],
      );
      return result.rows[0];
    } catch (error) {
      this.rethrowUnique(
        error,
        'PRINTER_CODE_EXISTS',
        'Codice stampante già usato.',
      );
    }
  }

  async update(auth: AuthContext, printerId: string, dto: UpdatePrinterDto) {
    const organizationId = assertOrganizationScope(auth);
    const current = await this.access.printer(organizationId, printerId);
    await this.access.assertAdministrativeLocation(auth, current.locationId);
    const agentDeviceId =
      dto.agentDeviceId !== undefined
        ? dto.agentDeviceId
        : current.agentDeviceId;
    if (agentDeviceId) {
      await this.access.assertAssignableDevice(
        organizationId,
        current.locationId,
        agentDeviceId,
      );
    }
    const result = await this.database.pool.query<AccessiblePrinter>(
      `
        UPDATE printers SET name=$3,purpose=$4::printer_purpose,
          agent_device_id=$5,driver=$6,paper_width_mm=$7,
          characters_per_line=$8,supports_cut=$9,supports_drawer=$10,
          status=$11::printer_status,updated_at=NOW()
        WHERE id=$1 AND organization_id=$2
        RETURNING id,organization_id AS "organizationId",
          location_id AS "locationId",code,name,purpose,
          agent_device_id AS "agentDeviceId",driver,
          paper_width_mm AS "paperWidthMm",
          characters_per_line AS "charactersPerLine",
          supports_cut AS "supportsCut",supports_drawer AS "supportsDrawer",
          status,last_seen_at AS "lastSeenAt",agent_version AS "agentVersion",
          status_message AS "statusMessage",created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [
        printerId,
        organizationId,
        dto.name?.trim() ?? current.name,
        dto.purpose ?? current.purpose,
        agentDeviceId,
        dto.driver?.trim() ?? current.driver,
        dto.paperWidthMm ?? current.paperWidthMm,
        dto.charactersPerLine ?? current.charactersPerLine,
        dto.supportsCut ?? current.supportsCut,
        dto.supportsDrawer ?? current.supportsDrawer,
        dto.status ?? current.status,
      ],
    );
    return result.rows[0];
  }

  async heartbeat(
    auth: AuthContext,
    printerId: string,
    dto: PrinterHeartbeatDto,
  ) {
    const printer = await this.access.assertAgentPrinter(auth, printerId);
    const result = await this.database.pool.query<AccessiblePrinter>(
      `
        UPDATE printers SET last_seen_at=NOW(),agent_version=$3,
          status_message=$4,updated_at=NOW()
        WHERE id=$1 AND organization_id=$2
        RETURNING id,organization_id AS "organizationId",
          location_id AS "locationId",code,name,purpose,
          agent_device_id AS "agentDeviceId",driver,
          paper_width_mm AS "paperWidthMm",
          characters_per_line AS "charactersPerLine",
          supports_cut AS "supportsCut",supports_drawer AS "supportsDrawer",
          status,last_seen_at AS "lastSeenAt",agent_version AS "agentVersion",
          status_message AS "statusMessage",created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [
        printerId,
        printer.organizationId,
        dto.agentVersion?.trim() || printer.agentVersion,
        dto.statusMessage?.trim() || null,
      ],
    );
    return result.rows[0];
  }

  async listRoutes(auth: AuthContext, query: PrintRouteListQueryDto) {
    const access = await this.access.assertAdministrativeLocation(
      auth,
      query.locationId,
    );
    const result = await this.database.pool.query<RouteRow>(
      `
        SELECT pr.id,pr.organization_id AS "organizationId",
          pr.location_id AS "locationId",pr.route_key AS "routeKey",
          pr.document_type AS "documentType",
          pr.kitchen_station_id AS "kitchenStationId",
          ks.name AS "kitchenStationName",pr.printer_id AS "printerId",
          p.code AS "printerCode",p.name AS "printerName",
          p.purpose AS "printerPurpose",pr.copies,pr.active,
          pr.created_at AS "createdAt",pr.updated_at AS "updatedAt"
        FROM printer_routes pr
        JOIN printers p ON p.id=pr.printer_id AND p.organization_id=pr.organization_id
        LEFT JOIN kitchen_stations ks ON ks.id=pr.kitchen_station_id
        WHERE pr.organization_id=$1 AND pr.location_id=$2
        ORDER BY pr.document_type,ks.name,p.name
      `,
      [access.organizationId, query.locationId],
    );
    return result.rows;
  }

  async upsertRoute(auth: AuthContext, dto: UpsertPrintRouteDto) {
    const access = await this.access.assertAdministrativeLocation(
      auth,
      dto.locationId,
    );
    const printer = await this.access.printer(
      access.organizationId,
      dto.printerId,
    );
    if (printer.locationId !== dto.locationId) {
      throw new ConflictException({
        code: 'PRINTER_LOCATION_MISMATCH',
        message: 'La stampante appartiene a una sede diversa.',
      });
    }
    assertPrinterSupportsDocument(printer.purpose, dto.documentType);
    const routeKey = buildPrintRouteKey(dto.documentType, dto.kitchenStationId);
    if (dto.kitchenStationId) {
      const station = await this.database.pool.query<
        { id: string } & QueryResultRow
      >(
        `SELECT id FROM kitchen_stations WHERE id=$1 AND organization_id=$2
         AND location_id=$3 AND status='ACTIVE' LIMIT 1`,
        [dto.kitchenStationId, access.organizationId, dto.locationId],
      );
      if (!station.rows[0]) {
        throw new NotFoundException({
          code: 'KITCHEN_STATION_NOT_FOUND',
          message: 'Postazione cucina attiva non trovata.',
        });
      }
    }
    const saved = await this.database.pool.query<
      { id: string } & QueryResultRow
    >(
      `
        INSERT INTO printer_routes(
          id,organization_id,location_id,route_key,document_type,
          kitchen_station_id,printer_id,copies,active
        ) VALUES($1,$2,$3,$4,$5::print_document_type,$6,$7,$8,$9)
        ON CONFLICT(location_id,route_key,printer_id) DO UPDATE SET
          document_type=EXCLUDED.document_type,
          kitchen_station_id=EXCLUDED.kitchen_station_id,
          copies=EXCLUDED.copies,active=EXCLUDED.active,updated_at=NOW()
        RETURNING id
      `,
      [
        randomUUID(),
        access.organizationId,
        dto.locationId,
        routeKey,
        dto.documentType,
        dto.kitchenStationId ?? null,
        dto.printerId,
        dto.copies ?? 1,
        dto.active ?? true,
      ],
    );
    const routeId = saved.rows[0]?.id;
    if (!routeId) throw new Error('Print route upsert did not return an id.');
    const result = await this.database.pool.query<RouteRow>(
      `
        SELECT pr.id,pr.organization_id AS "organizationId",
          pr.location_id AS "locationId",pr.route_key AS "routeKey",
          pr.document_type AS "documentType",
          pr.kitchen_station_id AS "kitchenStationId",
          ks.name AS "kitchenStationName",pr.printer_id AS "printerId",
          p.code AS "printerCode",p.name AS "printerName",
          p.purpose AS "printerPurpose",pr.copies,pr.active,
          pr.created_at AS "createdAt",pr.updated_at AS "updatedAt"
        FROM printer_routes pr
        JOIN printers p ON p.id=pr.printer_id
        LEFT JOIN kitchen_stations ks ON ks.id=pr.kitchen_station_id
        WHERE pr.id=$1 AND pr.organization_id=$2
      `,
      [routeId, access.organizationId],
    );
    return result.rows[0];
  }

  async deleteRoute(auth: AuthContext, routeId: string) {
    const organizationId = assertOrganizationScope(auth);
    const route = await this.database.pool.query<
      { id: string; locationId: string } & QueryResultRow
    >(
      `SELECT id,location_id AS "locationId" FROM printer_routes
       WHERE id=$1 AND organization_id=$2 LIMIT 1`,
      [routeId, organizationId],
    );
    if (!route.rows[0]) {
      throw new NotFoundException({
        code: 'PRINT_ROUTE_NOT_FOUND',
        message: 'Rotta di stampa non trovata.',
      });
    }
    await this.access.assertAdministrativeLocation(
      auth,
      route.rows[0].locationId,
    );
    await this.database.pool.query(
      `DELETE FROM printer_routes WHERE id=$1 AND organization_id=$2`,
      [routeId, organizationId],
    );
    return { deleted: true };
  }

  private rethrowUnique(error: unknown, code: string, message: string): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    ) {
      throw new ConflictException({ code, message });
    }
    throw error;
  }
}
