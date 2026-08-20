import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { LocationAccessService } from '../auth/location-access.service';
import { assertOrganizationScope } from '../auth/tenant-scope';
import type { PrinterPurpose, PrinterStatus } from './printing.constants';

interface LocationAccessRow extends QueryResultRow {
  id: string;
  timezone: string;
  status: 'ACTIVE' | 'INACTIVE';
  assignmentId: string | null;
  assignmentLocationId: string | null;
}

export interface AccessiblePrinter extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  code: string;
  name: string;
  purpose: PrinterPurpose;
  agentDeviceId: string | null;
  driver: string;
  paperWidthMm: number;
  charactersPerLine: number;
  supportsCut: boolean;
  supportsDrawer: boolean;
  status: PrinterStatus;
  lastSeenAt: Date | null;
  agentVersion: string | null;
  statusMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class PrintingAccessService {
  constructor(
    private readonly database: DatabaseService,
    private readonly locationAccess: LocationAccessService,
  ) {}

  assertAdministrativeLocation(auth: AuthContext, locationId: string) {
    return this.locationAccess.assert(
      auth,
      locationId,
      auth.role === 'MANAGER' ? 'manage_location' : undefined,
    );
  }

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

  async printer(
    organizationId: string,
    printerId: string,
  ): Promise<AccessiblePrinter> {
    const result = await this.database.pool.query<AccessiblePrinter>(
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
        WHERE id = $1 AND organization_id = $2
        LIMIT 1
      `,
      [printerId, organizationId],
    );
    const printer = result.rows[0];
    if (!printer) {
      throw new NotFoundException({
        code: 'PRINTER_NOT_FOUND',
        message: 'Stampante non trovata.',
      });
    }
    return printer;
  }

  async assertAgentPrinter(
    auth: AuthContext,
    printerId: string,
  ): Promise<AccessiblePrinter> {
    const organizationId = assertOrganizationScope(auth);
    const printer = await this.printer(organizationId, printerId);
    await this.assertLocation(auth, printer.locationId);

    if (printer.status !== 'ACTIVE') {
      throw new NotFoundException({
        code: 'PRINTER_NOT_ACTIVE',
        message: 'Stampante non attiva.',
      });
    }
    if (printer.agentDeviceId !== auth.deviceId) {
      throw new ForbiddenException({
        code: 'PRINTER_AGENT_DEVICE_MISMATCH',
        message: 'La stampante è assegnata a un altro dispositivo agente.',
      });
    }
    return printer;
  }

  async assertAssignableDevice(
    organizationId: string,
    locationId: string,
    deviceId: string,
  ): Promise<void> {
    const result = await this.database.pool.query<
      { id: string } & QueryResultRow
    >(
      `
        SELECT d.id
        FROM devices d
        JOIN device_assignments da
          ON da.device_id = d.id
         AND da.organization_id = $1
         AND da.active = TRUE
        WHERE d.id = $2
          AND d.status = 'ACTIVE'
          AND (da.location_id IS NULL OR da.location_id = $3)
        LIMIT 1
      `,
      [organizationId, deviceId, locationId],
    );
    if (!result.rows[0]) {
      throw new NotFoundException({
        code: 'PRINTER_AGENT_DEVICE_NOT_AVAILABLE',
        message: 'Dispositivo agente attivo non disponibile nella sede.',
      });
    }
  }
}
