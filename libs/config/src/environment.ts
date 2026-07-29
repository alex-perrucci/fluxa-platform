import { z } from 'zod';

const booleanString = (defaultValue: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(defaultValue)
    .transform((value) => value === 'true');

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    RELEASE_SHA: z.string().min(1).max(100).default('local'),
    RELEASE_VERSION: z.string().min(1).max(50).default('0.8.0'),
    INFRASTRUCTURE_TRUST_MODE: z
      .enum(['managed-tls', 'private-docker-network'])
      .default('managed-tls'),
    DATABASE_URL: z.string().min(1).startsWith('postgresql://'),
    DATABASE_SSL: booleanString('false'),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(20),
    REDIS_HOST: z.string().min(1).default('127.0.0.1'),
    REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
    REDIS_PASSWORD: z.string().default(''),
    REDIS_TLS: booleanString('false'),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    BOOKING_WEB_BASE_URL: z.string().url().default('http://localhost:3000'),
    STRIPE_ENABLED: booleanString('false'),
    STRIPE_SECRET_KEY: z.string().default(''),
    STRIPE_WEBHOOK_SECRET: z.string().default(''),
    ACUBE_ENABLED: booleanString('false'),
    ACUBE_BEARER_TOKEN: z.string().default(''),
    ACUBE_EMAIL: z.string().default(''),
    ACUBE_PASSWORD: z.string().default(''),
    ACUBE_API_BASE_URL: z.string().default(''),
    ACUBE_AUTH_BASE_URL: z.string().default(''),
    TRUST_PROXY: booleanString('false'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    SWAGGER_ENABLED: booleanString('false'),
    ACCESS_TOKEN_SECRET: z.string().min(32),
    REFRESH_TOKEN_SECRET: z.string().min(32),
    SESSION_IP_HASH_SECRET: z.string().min(32),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(3600)
      .default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    JWT_ISSUER: z.string().min(3).default('fluxa-platform'),
    JWT_AUDIENCE: z.string().min(3).default('fluxa-pos'),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV !== 'production') return;

    const addIssue = (path: string, message: string): void => {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [path],
        message,
      });
    };
    const placeholder = /change[_-]?me|replace|example|generate|<|>/i;
    const localHost = /^(localhost|127\.0\.0\.1|::1)$/i;
    let databaseHostname = '';

    try {
      const databaseUrl = new URL(environment.DATABASE_URL);
      databaseHostname = databaseUrl.hostname;
      if (localHost.test(databaseHostname)) {
        addIssue('DATABASE_URL', 'must not target localhost in production');
      }
    } catch {
      addIssue('DATABASE_URL', 'must be a valid PostgreSQL URL');
    }

    if (environment.INFRASTRUCTURE_TRUST_MODE === 'managed-tls') {
      if (!environment.DATABASE_SSL) {
        addIssue('DATABASE_SSL', 'must be true with managed-tls');
      }
      if (!environment.REDIS_TLS) {
        addIssue('REDIS_TLS', 'must be true with managed-tls');
      }
    } else {
      if (databaseHostname !== 'postgres') {
        addIssue(
          'DATABASE_URL',
          'must target the postgres service in private-docker-network mode',
        );
      }
      if (environment.REDIS_HOST !== 'redis') {
        addIssue(
          'REDIS_HOST',
          'must target the redis service in private-docker-network mode',
        );
      }
      if (environment.DATABASE_SSL) {
        addIssue(
          'DATABASE_SSL',
          'must be false inside the private Docker network',
        );
      }
      if (environment.REDIS_TLS) {
        addIssue(
          'REDIS_TLS',
          'must be false inside the private Docker network',
        );
      }
    }

    if (
      environment.REDIS_PASSWORD.length < 16 ||
      placeholder.test(environment.REDIS_PASSWORD)
    ) {
      addIssue(
        'REDIS_PASSWORD',
        'must be a non-placeholder secret of at least 16 characters',
      );
    }

    const secrets = [
      ['ACCESS_TOKEN_SECRET', environment.ACCESS_TOKEN_SECRET],
      ['REFRESH_TOKEN_SECRET', environment.REFRESH_TOKEN_SECRET],
      ['SESSION_IP_HASH_SECRET', environment.SESSION_IP_HASH_SECRET],
    ] as const;

    for (const [name, value] of secrets) {
      if (value.length < 48 || placeholder.test(value)) {
        addIssue(
          name,
          'must be a non-placeholder secret of at least 48 characters',
        );
      }
    }

    if (new Set(secrets.map(([, value]) => value)).size !== secrets.length) {
      addIssue('ACCESS_TOKEN_SECRET', 'all security secrets must be distinct');
    }

    const origins = environment.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    if (origins.length === 0) {
      addIssue('CORS_ORIGINS', 'must contain at least one production origin');
    }

    for (const origin of origins) {
      if (origin === '*') {
        addIssue(
          'CORS_ORIGINS',
          'wildcard origins are forbidden in production',
        );
        continue;
      }

      try {
        const url = new URL(origin);
        if (url.protocol !== 'https:' || localHost.test(url.hostname)) {
          addIssue(
            'CORS_ORIGINS',
            `origin ${origin} must be a non-local HTTPS URL`,
          );
        }
      } catch {
        addIssue('CORS_ORIGINS', `origin ${origin} is not a valid URL`);
      }
    }

    try {
      const bookingUrl = new URL(environment.BOOKING_WEB_BASE_URL);
      if (
        bookingUrl.protocol !== 'https:' ||
        localHost.test(bookingUrl.hostname)
      ) {
        addIssue('BOOKING_WEB_BASE_URL', 'must be a non-local HTTPS URL');
      }
    } catch {
      addIssue('BOOKING_WEB_BASE_URL', 'must be a valid URL');
    }

    if (environment.STRIPE_ENABLED) {
      if (!environment.STRIPE_SECRET_KEY.startsWith('sk_live_')) {
        addIssue('STRIPE_SECRET_KEY', 'must start with sk_live_');
      }
      if (!environment.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')) {
        addIssue('STRIPE_WEBHOOK_SECRET', 'must start with whsec_');
      }
    }

    if (environment.ACUBE_ENABLED) {
      const hasBearer =
        environment.ACUBE_BEARER_TOKEN.length >= 16 &&
        !placeholder.test(environment.ACUBE_BEARER_TOKEN);
      const hasCredentials =
        environment.ACUBE_EMAIL.length > 0 &&
        environment.ACUBE_PASSWORD.length >= 12 &&
        !placeholder.test(environment.ACUBE_EMAIL + environment.ACUBE_PASSWORD);

      if (!hasBearer && !hasCredentials) {
        addIssue(
          'ACUBE_BEARER_TOKEN',
          'configure a bearer token or A-Cube email and password',
        );
      }

      for (const [name, raw] of [
        ['ACUBE_API_BASE_URL', environment.ACUBE_API_BASE_URL],
        ['ACUBE_AUTH_BASE_URL', environment.ACUBE_AUTH_BASE_URL],
      ] as const) {
        try {
          const url = new URL(raw);
          if (url.protocol !== 'https:' || localHost.test(url.hostname)) {
            addIssue(name, 'must be a non-local HTTPS URL');
          }
        } catch {
          addIssue(name, 'must be a valid URL');
        }
      }
    }

    if (['debug', 'trace'].includes(environment.LOG_LEVEL)) {
      addIssue('LOG_LEVEL', 'debug and trace are forbidden in production');
    }
    if (environment.SWAGGER_ENABLED) {
      addIssue('SWAGGER_ENABLED', 'must be false in production');
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(
  config: Record<string, unknown>,
): Environment {
  const result = environmentSchema.safeParse(config);
  if (!result.success) {
    const details = result.error.issues
      .map(
        (issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`,
      )
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return result.data;
}
