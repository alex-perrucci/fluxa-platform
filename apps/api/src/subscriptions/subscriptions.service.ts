import { randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import type { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import {
  PLAN_ENTITLEMENTS,
  PLAN_PRESENTATION,
  requiredPlanForEntitlement,
  type Entitlement,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from './entitlements';

interface SubscriptionRow extends QueryResultRow {
  id: string;
  organizationId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  startsAt: Date;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class SubscriptionsService {
  constructor(private readonly database: DatabaseService) {}

  async getOrganizationEntitlements(organizationId: string) {
    const subscription = await this.getSubscription(organizationId);
    const entitlements =
      subscription.status === 'SUSPENDED'
        ? []
        : [...PLAN_ENTITLEMENTS[subscription.plan]];
    const presentation = PLAN_PRESENTATION[subscription.plan];
    const upgrade = this.nextPlan(subscription.plan);

    return {
      plan: subscription.plan,
      status: subscription.status,
      startsAt: subscription.startsAt,
      endsAt: subscription.endsAt,
      entitlements,
      planName: presentation.name,
      planDescription: presentation.description,
      includedFeatures: presentation.includedFeatures,
      upgrade: upgrade
        ? {
            plan: upgrade,
            planName: PLAN_PRESENTATION[upgrade].name,
            features: PLAN_PRESENTATION[upgrade].includedFeatures.filter(
              (feature) => !presentation.includedFeatures.includes(feature),
            ),
          }
        : null,
    };
  }

  async hasEntitlement(
    organizationId: string,
    entitlement: Entitlement,
  ): Promise<boolean> {
    const subscription = await this.getSubscription(organizationId);
    return (
      subscription.status !== 'SUSPENDED' &&
      PLAN_ENTITLEMENTS[subscription.plan].includes(entitlement)
    );
  }

  async assertEntitlement(
    organizationId: string,
    entitlement: Entitlement,
  ): Promise<void> {
    const subscription = await this.getSubscription(organizationId);

    if (subscription.status === 'SUSPENDED') {
      throw new ForbiddenException({
        code: 'SUBSCRIPTION_SUSPENDED',
        feature: entitlement,
        message: 'La subscription Fluxa è sospesa.',
      });
    }

    if (!PLAN_ENTITLEMENTS[subscription.plan].includes(entitlement)) {
      throw new ForbiddenException({
        code: 'FEATURE_NOT_INCLUDED',
        feature: entitlement,
        requiredPlan: requiredPlanForEntitlement(entitlement),
        message: 'La funzionalità non è inclusa nel piano Fluxa corrente.',
      });
    }
  }

  async getSubscription(organizationId: string): Promise<SubscriptionRow> {
    const result = await this.database.pool.query<SubscriptionRow>(
      `
        SELECT id, organization_id AS "organizationId", plan, status,
          starts_at AS "startsAt", ends_at AS "endsAt",
          created_at AS "createdAt", updated_at AS "updatedAt"
        FROM organization_subscriptions
        WHERE organization_id = $1
        LIMIT 1
      `,
      [organizationId],
    );
    const subscription = result.rows[0];

    if (!subscription) {
      throw new ForbiddenException({
        code: 'SUBSCRIPTION_NOT_PROVISIONED',
        message: 'Nessun piano Fluxa è assegnato a questa organizzazione.',
      });
    }
    return subscription;
  }

  async setSubscription(
    auth: AuthContext,
    organizationId: string,
    dto: UpdateSubscriptionDto,
  ) {
    return this.withTransaction(async (client) => {
      const organization = await client.query<{ id: string } & QueryResultRow>(
        'SELECT id FROM organizations WHERE id = $1 LIMIT 1',
        [organizationId],
      );
      if (!organization.rows[0]) {
        throw new NotFoundException({
          code: 'ORGANIZATION_NOT_FOUND',
          message: 'Organizzazione non trovata.',
        });
      }

      const currentResult = await client.query<SubscriptionRow>(
        `
          SELECT id, organization_id AS "organizationId", plan, status,
            starts_at AS "startsAt", ends_at AS "endsAt",
            created_at AS "createdAt", updated_at AS "updatedAt"
          FROM organization_subscriptions
          WHERE organization_id = $1
          FOR UPDATE
        `,
        [organizationId],
      );
      const current = currentResult.rows[0];
      const startsAt = dto.startsAt
        ? new Date(dto.startsAt)
        : current?.startsAt ?? new Date();
      const endsAt =
        dto.endsAt === undefined
          ? current?.endsAt ?? null
          : dto.endsAt
            ? new Date(dto.endsAt)
            : null;

      const saved = await client.query<SubscriptionRow>(
        `
          INSERT INTO organization_subscriptions (
            id, organization_id, plan, status, starts_at, ends_at
          )
          VALUES ($1,$2,$3::subscription_plan,$4::subscription_status,$5,$6)
          ON CONFLICT (organization_id) DO UPDATE SET
            plan = EXCLUDED.plan,
            status = EXCLUDED.status,
            starts_at = EXCLUDED.starts_at,
            ends_at = EXCLUDED.ends_at,
            updated_at = NOW()
          RETURNING id, organization_id AS "organizationId", plan, status,
            starts_at AS "startsAt", ends_at AS "endsAt",
            created_at AS "createdAt", updated_at AS "updatedAt"
        `,
        [randomUUID(), organizationId, dto.plan, dto.status, startsAt, endsAt],
      );

      const next = saved.rows[0]!;
      await client.query(
        `
          INSERT INTO audit_events (
            id, organization_id, actor_user_id, action,
            entity_type, entity_id, payload
          )
          VALUES (
            $1,$2,$3,'organization.subscription.updated',
            'organization_subscription',$4,$5::jsonb
          )
        `,
        [
          randomUUID(),
          organizationId,
          auth.userId,
          next.id,
          JSON.stringify({
            previous: current
              ? { plan: current.plan, status: current.status }
              : null,
            next: { plan: next.plan, status: next.status },
            startsAt: next.startsAt,
            endsAt: next.endsAt,
          }),
        ],
      );

      return {
        ...next,
        entitlements:
          next.status === 'SUSPENDED' ? [] : [...PLAN_ENTITLEMENTS[next.plan]],
      };
    });
  }

  private nextPlan(plan: SubscriptionPlan): SubscriptionPlan | null {
    if (plan === 'START') return 'SALA';
    if (plan === 'SALA') return 'PRO';
    return null;
  }

  private async withTransaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
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
