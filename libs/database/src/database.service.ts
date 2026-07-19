import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly pool: Pool;
  readonly db: NodePgDatabase<typeof schema>;

  constructor(config: ConfigService) {
    const useSsl = config.getOrThrow<boolean>('DATABASE_SSL');

    this.pool = new Pool({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
      max: config.getOrThrow<number>('DATABASE_POOL_MAX'),
      ssl: useSsl ? { rejectUnauthorized: true } : false,
      application_name: 'fluxa-platform',
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });

    this.db = drizzle(this.pool, { schema });
  }

  async ping(): Promise<boolean> {
    const result = await this.pool.query<{ ok: number }>('SELECT 1 AS ok');
    return result.rows[0]?.ok === 1;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
