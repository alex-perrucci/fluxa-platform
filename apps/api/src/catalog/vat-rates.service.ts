import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, eq, ilike, or, type SQL } from 'drizzle-orm';
import { auditEvents, vatRates } from '@fluxa/database';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import { normalizePagination, validateVatDefinition } from './catalog-policy';
import type { CatalogListQueryDto } from './dto/catalog-list-query.dto';
import type { CreateVatRateDto } from './dto/create-vat-rate.dto';
import type { UpdateVatRateDto } from './dto/update-vat-rate.dto';

@Injectable()
export class VatRatesService {
  constructor(private readonly database: DatabaseService) {}

  async list(auth: AuthContext, query: CatalogListQueryDto) {
    const organizationId = assertOrganizationScope(auth);
    const pagination = normalizePagination(query);
    const conditions: SQL[] = [eq(vatRates.organizationId, organizationId)];

    if (query.status) {
      conditions.push(eq(vatRates.status, query.status));
    }

    const search = query.q?.trim();
    if (search) {
      const predicate = or(
        ilike(vatRates.code, `%${search}%`),
        ilike(vatRates.name, `%${search}%`),
      );
      if (predicate) conditions.push(predicate);
    }

    const where = and(...conditions);
    const [items, totalRows] = await Promise.all([
      this.database.db
        .select()
        .from(vatRates)
        .where(where)
        .orderBy(asc(vatRates.rateBasisPoints), asc(vatRates.name))
        .limit(pagination.pageSize)
        .offset(pagination.offset),
      this.database.db.select({ value: count() }).from(vatRates).where(where),
    ]);

    return {
      items,
      total: totalRows[0]?.value ?? 0,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  async get(auth: AuthContext, vatRateId: string) {
    const organizationId = assertOrganizationScope(auth);
    const [vatRate] = await this.database.db
      .select()
      .from(vatRates)
      .where(
        and(
          eq(vatRates.id, vatRateId),
          eq(vatRates.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!vatRate) {
      throw new NotFoundException({
        code: 'VAT_RATE_NOT_FOUND',
        message: 'Aliquota IVA non trovata.',
      });
    }

    return vatRate;
  }

  async create(auth: AuthContext, dto: CreateVatRateDto) {
    const organizationId = assertOrganizationScope(auth);
    const natureCode = dto.natureCode?.trim().toUpperCase() || null;
    validateVatDefinition(dto.rateBasisPoints, natureCode);

    try {
      return await this.database.db.transaction(async (tx) => {
        if (dto.isDefault) {
          await tx
            .update(vatRates)
            .set({ isDefault: false, updatedAt: new Date() })
            .where(eq(vatRates.organizationId, organizationId));
        }

        const [vatRate] = await tx
          .insert(vatRates)
          .values({
            organizationId,
            code: dto.code.trim().toUpperCase(),
            name: dto.name.trim(),
            rateBasisPoints: dto.rateBasisPoints,
            natureCode,
            fiscalDescription: dto.fiscalDescription?.trim() || null,
            isDefault: dto.isDefault ?? false,
          })
          .returning();

        await tx.insert(auditEvents).values({
          organizationId,
          actorUserId: auth.userId,
          action: 'vat_rate.created',
          entityType: 'vat_rate',
          entityId: vatRate.id,
          payload: {
            code: vatRate.code,
            rateBasisPoints: vatRate.rateBasisPoints,
          },
        });

        return vatRate;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'VAT_RATE_CODE_ALREADY_EXISTS',
          message: "Il codice dell'aliquota IVA è già utilizzato.",
        });
      }

      throw error;
    }
  }

  async update(auth: AuthContext, vatRateId: string, dto: UpdateVatRateDto) {
    const current = await this.get(auth, vatRateId);
    const rateBasisPoints = dto.rateBasisPoints ?? current.rateBasisPoints;
    const natureCode =
      dto.natureCode !== undefined
        ? dto.natureCode?.trim().toUpperCase() || null
        : current.natureCode;

    validateVatDefinition(rateBasisPoints, natureCode);

    try {
      return await this.database.db.transaction(async (tx) => {
        if (dto.isDefault) {
          await tx
            .update(vatRates)
            .set({ isDefault: false, updatedAt: new Date() })
            .where(eq(vatRates.organizationId, current.organizationId));
        }

        const [vatRate] = await tx
          .update(vatRates)
          .set({
            code: dto.code?.trim().toUpperCase() ?? current.code,
            name: dto.name?.trim() ?? current.name,
            rateBasisPoints,
            natureCode,
            fiscalDescription:
              dto.fiscalDescription !== undefined
                ? dto.fiscalDescription.trim() || null
                : current.fiscalDescription,
            isDefault: dto.isDefault ?? current.isDefault,
            status: dto.status ?? current.status,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(vatRates.id, vatRateId),
              eq(vatRates.organizationId, current.organizationId),
            ),
          )
          .returning();

        await tx.insert(auditEvents).values({
          organizationId: current.organizationId,
          actorUserId: auth.userId,
          action: 'vat_rate.updated',
          entityType: 'vat_rate',
          entityId: vatRate.id,
          payload: {
            status: vatRate.status,
            rateBasisPoints: vatRate.rateBasisPoints,
          },
        });

        return vatRate;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'VAT_RATE_CODE_ALREADY_EXISTS',
          message: "Il codice dell'aliquota IVA è già utilizzato.",
        });
      }

      throw error;
    }
  }

  async archive(auth: AuthContext, vatRateId: string) {
    const current = await this.get(auth, vatRateId);

    const [vatRate] = await this.database.db
      .update(vatRates)
      .set({
        status: 'INACTIVE',
        isDefault: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(vatRates.id, vatRateId),
          eq(vatRates.organizationId, current.organizationId),
        ),
      )
      .returning();

    await this.database.db.insert(auditEvents).values({
      organizationId: current.organizationId,
      actorUserId: auth.userId,
      action: 'vat_rate.archived',
      entityType: 'vat_rate',
      entityId: vatRate.id,
      payload: {},
    });

    return vatRate;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }
}
