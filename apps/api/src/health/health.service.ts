import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { DatabaseService } from '@fluxa/database';

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(
    private readonly database: DatabaseService,
    config: ConfigService,
  ) {
    this.redis = new Redis({
      host: config.getOrThrow<string>('REDIS_HOST'),
      port: config.getOrThrow<number>('REDIS_PORT'),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      lazyConnect: true,
      connectTimeout: 5_000,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
    });
  }

  live() {
    return {
      status: 'ok',
      service: 'fluxa-api',
      timestamp: new Date().toISOString(),
    };
  }

  async ready() {
    const startedAt = Date.now();

    const [databaseResult, redisResult] = await Promise.allSettled([
      this.database.ping(),
      this.redis.ping(),
    ]);

    const checks = {
      database:
        databaseResult.status === 'fulfilled' && databaseResult.value === true
          ? 'up'
          : 'down',
      redis:
        redisResult.status === 'fulfilled' && redisResult.value === 'PONG'
          ? 'up'
          : 'down',
    } as const;

    const response = {
      status:
        checks.database === 'up' && checks.redis === 'up' ? 'ok' : 'error',
      checks,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };

    if (response.status === 'error') {
      throw new ServiceUnavailableException(response);
    }

    return response;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status === 'end') return;

    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}
