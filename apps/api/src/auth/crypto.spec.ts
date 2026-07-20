import { randomUUID } from 'node:crypto';
import {
  createRefreshToken,
  hashRefreshToken,
  parseRefreshToken,
  safeHashEquals,
} from './crypto';

describe('refresh token helpers', () => {
  it('creates a parseable device-bound refresh token', () => {
    const sessionId = randomUUID();
    const token = createRefreshToken(sessionId);
    const parsed = parseRefreshToken(token);

    expect(parsed?.sessionId).toBe(sessionId);
    expect(parsed?.token).toBe(token);
  });

  it('rejects malformed refresh tokens', () => {
    expect(parseRefreshToken('invalid')).toBeNull();
    expect(parseRefreshToken(`${randomUUID()}.short`)).toBeNull();
  });

  it('compares hashes in constant-time compatible buffers', () => {
    const hash = hashRefreshToken('token');
    expect(safeHashEquals(hash, hash)).toBe(true);
    expect(safeHashEquals(hash, hashRefreshToken('other'))).toBe(false);
  });
});
