import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, eq, ilike, or, type SQL } from 'drizzle-orm';
import { auditEvents, categories } from '@fluxa/database';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import { normalizePagination } from './catalog-policy';
import type { CatalogListQueryDto } from './dto/catalog-list-query.dto';
import type { CreateCategoryDto } from './dto/create-category.dto';
import type { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly database: DatabaseService) {}

  async list(auth: AuthContext, query: CatalogListQueryDto) {
    const organizationId = assertOrganizationScope(auth);
    const pagination = normalizePagination(query);
    const conditions: SQL[] = [eq(categories.organizationId, organizationId)];

    if (query.status) {
      conditions.push(eq(categories.status, query.status));
    }

    const search = query.q?.trim();
    if (search) {
      const predicate = or(
        ilike(categories.code, `%${search}%`),
        ilike(categories.name, `%${search}%`),
      );
      if (predicate) conditions.push(predicate);
    }

    const where = and(...conditions);
    const [items, totalRows] = await Promise.all([
      this.database.db
        .select()
        .from(categories)
        .where(where)
        .orderBy(asc(categories.sortOrder), asc(categories.name))
        .limit(pagination.pageSize)
        .offset(pagination.offset),
      this.database.db.select({ value: count() }).from(categories).where(where),
    ]);

    return {
      items,
      total: totalRows[0]?.value ?? 0,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  async get(auth: AuthContext, categoryId: string) {
    const organizationId = assertOrganizationScope(auth);
    const [category] = await this.database.db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.id, categoryId),
          eq(categories.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!category) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Categoria non trovata.',
      });
    }

    return category;
  }

  async create(auth: AuthContext, dto: CreateCategoryDto) {
    const organizationId = assertOrganizationScope(auth);

    try {
      return await this.database.db.transaction(async (tx) => {
        const [category] = await tx
          .insert(categories)
          .values({
            organizationId,
            code: dto.code.trim().toUpperCase(),
            name: dto.name.trim(),
            description: dto.description?.trim() || null,
            colorHex: dto.colorHex?.trim().toUpperCase() || null,
            imageUrl: dto.imageUrl?.trim() || null,
            sortOrder: dto.sortOrder ?? 0,
          })
          .returning();

        await tx.insert(auditEvents).values({
          organizationId,
          actorUserId: auth.userId,
          action: 'category.created',
          entityType: 'category',
          entityId: category.id,
          payload: { code: category.code },
        });

        return category;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'CATEGORY_CODE_ALREADY_EXISTS',
          message: 'Il codice della categoria è già utilizzato.',
        });
      }

      throw error;
    }
  }

  async update(auth: AuthContext, categoryId: string, dto: UpdateCategoryDto) {
    const current = await this.get(auth, categoryId);

    try {
      return await this.database.db.transaction(async (tx) => {
        const [category] = await tx
          .update(categories)
          .set({
            code: dto.code?.trim().toUpperCase() ?? current.code,
            name: dto.name?.trim() ?? current.name,
            description:
              dto.description !== undefined
                ? dto.description.trim() || null
                : current.description,
            colorHex:
              dto.colorHex !== undefined
                ? dto.colorHex.trim().toUpperCase() || null
                : current.colorHex,
            imageUrl:
              dto.imageUrl !== undefined
                ? dto.imageUrl?.trim() || null
                : current.imageUrl,
            sortOrder: dto.sortOrder ?? current.sortOrder,
            status: dto.status ?? current.status,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(categories.id, categoryId),
              eq(categories.organizationId, current.organizationId),
            ),
          )
          .returning();

        await tx.insert(auditEvents).values({
          organizationId: current.organizationId,
          actorUserId: auth.userId,
          action: 'category.updated',
          entityType: 'category',
          entityId: category.id,
          payload: { status: category.status },
        });

        return category;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'CATEGORY_CODE_ALREADY_EXISTS',
          message: 'Il codice della categoria è già utilizzato.',
        });
      }

      throw error;
    }
  }

  async archive(auth: AuthContext, categoryId: string) {
    const current = await this.get(auth, categoryId);
    const [category] = await this.database.db
      .update(categories)
      .set({ status: 'INACTIVE', updatedAt: new Date() })
      .where(
        and(
          eq(categories.id, categoryId),
          eq(categories.organizationId, current.organizationId),
        ),
      )
      .returning();

    await this.database.db.insert(auditEvents).values({
      organizationId: current.organizationId,
      actorUserId: auth.userId,
      action: 'category.archived',
      entityType: 'category',
      entityId: category.id,
      payload: {},
    });

    return category;
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
