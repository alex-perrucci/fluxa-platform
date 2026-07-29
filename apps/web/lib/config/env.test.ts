import { afterEach, describe, expect, it } from 'vitest';
import { getServerEnv } from './env';

const originalNodeEnvironment = process.env.NODE_ENV;

describe('getServerEnv', () => {
  afterEach(() => {
    delete process.env.FLUXA_API_BASE_URL;

    if (originalNodeEnvironment === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnvironment;
    }
  });

  it('uses the local Fluxa API by default outside production', () => {
    process.env.NODE_ENV = 'development';

    expect(getServerEnv().FLUXA_API_BASE_URL).toBe(
      'http://localhost:3000/api/v1',
    );
  });

  it('rejects an invalid backend URL', () => {
    process.env.NODE_ENV = 'development';
    process.env.FLUXA_API_BASE_URL = 'not-a-url';

    expect(() => getServerEnv()).toThrow();
  });

  it('rejects a local or insecure API in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.FLUXA_API_BASE_URL = 'http://localhost:3000/api/v1';

    expect(() => getServerEnv()).toThrow(
      'must be a non-local HTTPS URL in production',
    );
  });

  it('accepts an HTTPS API in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.FLUXA_API_BASE_URL = 'https://api.example.com/api/v1';

    expect(getServerEnv().FLUXA_API_BASE_URL).toBe(
      'https://api.example.com/api/v1',
    );
  });
});
