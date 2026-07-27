import { validateEnvironment } from './environment';

const productionEnvironment = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://fluxa:password@postgres:5432/fluxa',
  DATABASE_SSL: 'true',
  REDIS_HOST: 'redis',
  REDIS_PASSWORD: 'r'.repeat(32),
  CORS_ORIGINS: 'https://pos.example.com',
  BOOKING_WEB_BASE_URL: 'https://booking.example.com',
  STRIPE_SECRET_KEY: `sk_live_${'s'.repeat(48)}`,
  STRIPE_WEBHOOK_SECRET: `whsec_${'w'.repeat(48)}`,
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

  it('accepts a production-safe environment', () => {
    const environment = validateEnvironment(productionEnvironment);
    expect(environment.NODE_ENV).toBe('production');
    expect(environment.DATABASE_SSL).toBe(true);
  });

  it.each([
    ['database TLS disabled', { DATABASE_SSL: 'false' }],
    [
      'local database',
      { DATABASE_URL: 'postgresql://u:p@localhost:5432/fluxa' },
    ],
    ['local CORS', { CORS_ORIGINS: 'http://localhost:8080' }],
    ['placeholder secret', { ACCESS_TOKEN_SECRET: 'CHANGE_ME'.repeat(8) }],
    ['duplicate secrets', { REFRESH_TOKEN_SECRET: 'a'.repeat(64) }],
    ['swagger enabled', { SWAGGER_ENABLED: 'true' }],
  ])('rejects production when %s', (_label, patch) => {
    expect(() =>
      validateEnvironment({ ...productionEnvironment, ...patch }),
    ).toThrow('Invalid environment configuration');
  });
});
