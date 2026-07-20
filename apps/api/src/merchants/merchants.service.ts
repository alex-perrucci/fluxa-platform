import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { auditEvents, merchants } from '@fluxa/database';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import type { CreateMerchantDto } from './dto/create-merchant.dto';
import type { UpdateMerchantDto } from './dto/update-merchant.dto';

@Injectable()
export class MerchantsService {
  constructor(private readonly database: DatabaseService) {}

  async list(auth: AuthContext) {
    const organizationId = assertOrganizationScope(auth);

    return this.database.db
      .select()
      .from(merchants)
      .where(eq(merchants.organizationId, organizationId))
      .orderBy(asc(merchants.legalName));
  }

  async get(auth: AuthContext, merchantId: string) {
    const organizationId = assertOrganizationScope(auth);

    const [merchant] = await this.database.db
      .select()
      .from(merchants)
      .where(
        and(
          eq(merchants.id, merchantId),
          eq(merchants.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!merchant) {
      throw new NotFoundException({
        code: 'MERCHANT_NOT_FOUND',
        message: 'Esercente non trovato.',
      });
    }

    return merchant;
  }

  async create(auth: AuthContext, dto: CreateMerchantDto) {
    const organizationId = assertOrganizationScope(auth);

    try {
      const [merchant] = await this.database.db
        .insert(merchants)
        .values({
          organizationId,
          legalName: dto.legalName.trim(),
          tradeName: dto.tradeName?.trim() || null,
          vatNumber: dto.vatNumber.trim().toUpperCase(),
          taxCode: dto.taxCode?.trim().toUpperCase() || null,
          countryCode: dto.countryCode?.toUpperCase() || 'IT',
        })
        .returning();

      await this.database.db.insert(auditEvents).values({
        organizationId,
        actorUserId: auth.userId,
        action: 'merchant.created',
        entityType: 'merchant',
        entityId: merchant.id,
        payload: {
          vatNumber: merchant.vatNumber,
          legalName: merchant.legalName,
        },
      });

      return merchant;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'MERCHANT_VAT_ALREADY_EXISTS',
          message: "Questa partita IVA è già presente nell'organizzazione.",
        });
      }

      throw error;
    }
  }

  async update(auth: AuthContext, merchantId: string, dto: UpdateMerchantDto) {
    const current = await this.get(auth, merchantId);

    try {
      const [merchant] = await this.database.db
        .update(merchants)
        .set({
          legalName: dto.legalName?.trim() ?? current.legalName,
          tradeName:
            dto.tradeName !== undefined
              ? dto.tradeName.trim() || null
              : current.tradeName,
          vatNumber: dto.vatNumber?.trim().toUpperCase() ?? current.vatNumber,
          taxCode:
            dto.taxCode !== undefined
              ? dto.taxCode.trim().toUpperCase() || null
              : current.taxCode,
          countryCode: dto.countryCode?.toUpperCase() ?? current.countryCode,
          status: dto.status ?? current.status,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(merchants.id, merchantId),
            eq(merchants.organizationId, current.organizationId),
          ),
        )
        .returning();

      await this.database.db.insert(auditEvents).values({
        organizationId: current.organizationId,
        actorUserId: auth.userId,
        action: 'merchant.updated',
        entityType: 'merchant',
        entityId: merchant.id,
        payload: { status: merchant.status },
      });

      return merchant;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'MERCHANT_VAT_ALREADY_EXISTS',
          message: "Questa partita IVA è già presente nell'organizzazione.",
        });
      }

      throw error;
    }
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
