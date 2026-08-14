import { validateEnvironment } from './environment';

const productionEnvironment = {
  NODE_ENV: 'production',
  INFRASTRUCTURE_TRUST_MODE: 'managed-tls',
  DATABASE_URL: 'postgresql://fluxa:password@database.example.com:5432/fluxa',
  DATABASE_SSL: 'true',
  REDIS_HOST: 'cache.example.com',
  REDIS_PASSWORD: 'r'.repeat(32),
  REDIS_TLS: 'true',
  CORS_ORIGINS: 'https://pos.example.com',
  BOOKING_WEB_BASE_URL: 'https://booking.example.com',
  STRIPE_ENABLED: 'true',
  STRIPE_SECRET_KEY: `sk_live_${'s'.repeat(48)}`,
  STRIPE_WEBHOOK_SECRET: `whsec_${'w'.repeat(48)}`,
  ACUBE_ENABLED: 'true',
  ACUBE_BEARER_TOKEN: 'd'.repeat(64),
  ACUBE_API_BASE_URL: 'https://api.acubeapi.com',
  ACUBE_AUTH_BASE_URL: 'https://common.api.acubeapi.com',
  OPENAPI_ENABLED: 'true',
  OPENAPI_BEARER_TOKEN: 'o'.repeat(64),
  OPENAPI_SANDBOX_BEARER_TOKEN: 'x'.repeat(64),
  TRUST_PROXY: 'true',
  LOG_LEVEL: 'info',
  SWAGGER_ENABLED: 'false',
  ACCESS_TOKEN_SECRET: 'a'.repeat(64),
  REFRESH_TOKEN_SECRET: 'b'.repeat(64),
  SESSION_IP_HASH_SECRET: 'c'.repeat(64),
};

describe('validateEnvironment', () => {
  it('coerces numeric and boolean values in development', () => {
    const environment = validateEnvironment({
      DATABASE_URL: 'postgresql://user:password@localhost:5432/fluxa',
      DATABASE_SSL: 'false',
      REDIS_PORT: '6379',
      ACCESS_TOKEN_SECRET: 'a'.repeat(32),
      REFRESH_TOKEN_SECRET: 'b'.repeat(32),
      SESSION_IP_HASH_SECRET: 'c'.repeat(32),
    });

    expect(environment.REDIS_PORT).toBe(6379);
    expect(environment.DATABASE_SSL).toBe(false);
    expect(environment.NODE_ENV).toBe('development');
    expect(environment.SWAGGER_ENABLED).toBe(false);
  });

  it('accepts a managed production environment', () => {
    const environment = validateEnvironment(productionEnvironment);
    expect(environment.NODE_ENV).toBe('production');
    expect(environment.DATABASE_SSL).toBe(true);
    expect(environment.REDIS_TLS).toBe(true);
    expect(environment.OPENAPI_SANDBOX_BEARER_TOKEN).toBe('x'.repeat(64));
  });

  it('accepts a private Docker network without internal TLS', () => {
    const environment = validateEnvironment({
      ...productionEnvironment,
      INFRASTRUCTURE_TRUST_MODE: 'private-docker-network',
      DATABASE_URL: 'postgresql://fluxa:password@postgres:5432/fluxa',
      DATABASE_SSL: 'false',
      REDIS_HOST: 'redis',
      REDIS_TLS: 'false',
      STRIPE_ENABLED: 'false',
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
      ACUBE_ENABLED: 'false',
      ACUBE_BEARER_TOKEN: '',
      ACUBE_API_BASE_URL: '',
      ACUBE_AUTH_BASE_URL: '',
    });

    expect(environment.INFRASTRUCTURE_TRUST_MODE).toBe(
      'private-docker-network',
    );
    expect(environment.DATABASE_SSL).toBe(false);
    expect(environment.REDIS_TLS).toBe(false);
  });

  it.each([
    ['managed database TLS disabled', { DATABASE_SSL: 'false' }],
    ['managed Redis TLS disabled', { REDIS_TLS: 'false' }],
    [
      'local database',
      { DATABASE_URL: 'postgresql://u:p@localhost:5432/fluxa' },
    ],
    ['local CORS', { CORS_ORIGINS: 'http://localhost:8080' }],
    ['placeholder secret', { ACCESS_TOKEN_SECRET: 'CHANGE_ME'.repeat(8) }],
    ['duplicate secrets', { REFRESH_TOKEN_SECRET: 'a'.repeat(64) }],
    ['swagger enabled', { SWAGGER_ENABLED: 'true' }],
    ['Stripe test key', { STRIPE_SECRET_KEY: 'sk_test_not_allowed' }],
  ])('rejects production when %s', (_label, patch) => {
    expect(() =>
      validateEnvironment({ ...productionEnvironment, ...patch }),
    ).toThrow('Invalid environment configuration');
  });

  it('rejects reusing the production OpenAPI token for sandbox', () => {
    expect(() =>
      validateEnvironment({
        ...productionEnvironment,
        OPENAPI_SANDBOX_BEARER_TOKEN:
          productionEnvironment.OPENAPI_BEARER_TOKEN,
      }),
    ).toThrow('Invalid environment configuration');
  });

  it('rejects a non-internal database in private Docker mode', () => {
    expect(() =>
      validateEnvironment({
        ...productionEnvironment,
        INFRASTRUCTURE_TRUST_MODE: 'private-docker-network',
        DATABASE_URL: 'postgresql://u:p@external.example.com:5432/fluxa',
        DATABASE_SSL: 'false',
        REDIS_HOST: 'redis',
        REDIS_TLS: 'false',
      }),
    ).toThrow('Invalid environment configuration');
  });
});
