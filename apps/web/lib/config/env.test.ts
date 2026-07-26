import { afterEach, describe, expect, it } from 'vitest';
import { getServerEnv } from './env';

describe('getServerEnv', () => {
  afterEach(() => {
    delete process.env.FLUXA_API_BASE_URL;
  });

  it('uses the local Fluxa API by default', () => {
    expect(getServerEnv().FLUXA_API_BASE_URL).toBe(
      'http://localhost:3000/api/v1',
    );
  });

  it('rejects an invalid backend URL', () => {
    process.env.FLUXA_API_BASE_URL = 'not-a-url';
    expect(() => getServerEnv()).toThrow();
  });
});
