import { ConflictException, Injectable } from '@nestjs/common';
import {
  auditEvents,
  organizationMemberships,
  organizations,
  organizationSubscriptions,
} from '@fluxa/database';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import type { CreateOrganizationDto } from './dto/create-organization.dto';

@Injectable()
export class OrganizationProvisioningService {
  constructor(private readonly database: DatabaseService) {}

  async create(auth: AuthContext, dto: CreateOrganizationDto) {
    const slug = dto.slug.trim().toLowerCase();

    try {
      return await this.database.db.transaction(async (tx) => {
        const [organization] = await tx
          .insert(organizations)
          .values({
            name: dto.name.trim(),
            slug,
            createdByUserId: auth.userId,
          })
          .returning();

        const [subscription] = await tx
          .insert(organizationSubscriptions)
          .values({
            organizationId: organization.id,
            plan: dto.plan,
            status: 'ACTIVE',
          })
          .returning();

        const [membership] = await tx
          .insert(organizationMemberships)
          .values({
            organizationId: organization.id,
            userId: auth.userId,
            role: 'OWNER',
          })
          .returning();

        await tx.insert(auditEvents).values({
          organizationId: organization.id,
          actorUserId: auth.userId,
          action: 'organization.created',
          entityType: 'organization',
          entityId: organization.id,
          payload: {
            slug,
            plan: subscription.plan,
            subscriptionId: subscription.id,
          },
        });

        return { organization, subscription, membership };
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === '23505'
      ) {
        throw new ConflictException({
          code: 'ORGANIZATION_SLUG_ALREADY_EXISTS',
          message: "Lo slug dell'organizzazione è già utilizzato.",
        });
      }
      throw error;
    }
  }
}
