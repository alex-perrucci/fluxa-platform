import { validateEnvironment } from './environment';

describe('validateEnvironment', () => {
  it('coerces numeric and boolean values', () => {
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
    expect(environment.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(environment.REFRESH_TOKEN_TTL_DAYS).toBe(30);
  });
});
