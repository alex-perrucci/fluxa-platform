import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getFluxaServerApiBaseUrl, getServerEnv } from './env';

const originalNodeEnvironment = process.env.NODE_ENV;
const originalApiBaseUrl = process.env.FLUXA_API_BASE_URL;
const originalInternalApiBaseUrl = process.env.FLUXA_INTERNAL_API_BASE_URL;

describe('getServerEnv', () => {
  beforeEach(() => {
    delete process.env.FLUXA_API_BASE_URL;
    delete process.env.FLUXA_INTERNAL_API_BASE_URL;
  });

  afterEach(() => {
    if (originalApiBaseUrl === undefined) {
      delete process.env.FLUXA_API_BASE_URL;
    } else {
      process.env.FLUXA_API_BASE_URL = originalApiBaseUrl;
    }
    if (originalInternalApiBaseUrl === undefined) {
      delete process.env.FLUXA_INTERNAL_API_BASE_URL;
    } else {
      process.env.FLUXA_INTERNAL_API_BASE_URL = originalInternalApiBaseUrl;
    }

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

  it('rejects a local or insecure public API in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.FLUXA_API_BASE_URL = 'http://localhost:3000/api/v1';
    expect(() => getServerEnv()).toThrow(
      'must be a non-local HTTPS URL in production',
    );
  });

  it('accepts an HTTPS public API in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.FLUXA_API_BASE_URL = 'https://api.example.com/api/v1';
    expect(getServerEnv().FLUXA_API_BASE_URL).toBe(
      'https://api.example.com/api/v1',
    );
  });

  it('prefers the private Docker API for server-side calls', () => {
    process.env.NODE_ENV = 'production';
    process.env.FLUXA_API_BASE_URL = 'https://api.example.com/api/v1';
    process.env.FLUXA_INTERNAL_API_BASE_URL = 'http://api:3000/api/v1/';

    expect(getFluxaServerApiBaseUrl()).toBe('http://api:3000/api/v1');
  });
});
