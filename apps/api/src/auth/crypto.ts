import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import * as argon2 from 'argon2';

const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
  });
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}

export function createRefreshToken(sessionId: string): string {
  return `${sessionId}.${randomBytes(48).toString('base64url')}`;
}

export function parseRefreshToken(token: string): {
  sessionId: string;
  token: string;
} | null {
  const separatorIndex = token.indexOf('.');
  if (separatorIndex <= 0) return null;

  const sessionId = token.slice(0, separatorIndex);
  const secret = token.slice(separatorIndex + 1);

  if (!SESSION_ID_PATTERN.test(sessionId) || secret.length < 32) {
    return null;
  }

  return { sessionId, token };
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function safeHashEquals(
  left: string | null | undefined,
  right: string,
): boolean {
  if (!left || left.length !== right.length) return false;

  return timingSafeEqual(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

export function hashIpAddress(
  ip: string | undefined,
  secret: string,
): string | null {
  if (!ip) return null;

  return createHash('sha256').update(`${secret}:${ip}`, 'utf8').digest('hex');
}
