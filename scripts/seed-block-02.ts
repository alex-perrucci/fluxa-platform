import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { users } from '../libs/database/src/schema';

try {
  process.loadEnvFile('.env');
} catch {
  // Environment variables may already be provided by the host.
}

const databaseUrl = process.env.DATABASE_URL;
const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const displayName =
  process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME?.trim() || 'Fluxa Admin';
const useSsl = process.env.DATABASE_SSL === 'true';

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}

if (!email || !password || password.length < 12) {
  throw new Error(
    'BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (minimum 12 characters) are required.',
  );
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: useSsl ? { rejectUnauthorized: true } : false,
});

const db = drizzle(pool);

async function main(): Promise<void> {
  const passwordHash = await argon2.hash(password!, {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
  });

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email!))
    .limit(1);

  if (existing) {
    await db
      .update(users)
      .set({
        displayName,
        passwordHash,
        platformAdmin: true,
        status: 'ACTIVE',
        passwordChangedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));

    console.log(
      JSON.stringify({
        action: 'updated',
        userId: existing.id,
        email,
        platformAdmin: true,
      }),
    );
    return;
  }

  const [created] = await db
    .insert(users)
    .values({
      email: email!,
      displayName,
      passwordHash,
      platformAdmin: true,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    })
    .returning({ id: users.id });

  console.log(
    JSON.stringify({
      action: 'created',
      userId: created.id,
      email,
      platformAdmin: true,
    }),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
