// PHASE_7_RUNTIME_INTEGRATION
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

export function loadLocalEnvironment() {
  if (!existsSync('.env')) {
    return;
  }

  const inheritedEnvironment = { ...process.env };
  process.loadEnvFile('.env');
  Object.assign(process.env, inheritedEnvironment);
}

export function localDatabaseConfig() {
  loadLocalEnvironment();

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'PHASE_7_REFUSED: NODE_ENV=production non è consentito.',
    );
  }

  const rawUrl = process.env.DATABASE_URL?.trim();

  if (!rawUrl) {
    throw new Error('PHASE_7_REFUSED: DATABASE_URL non configurato.');
  }

  const databaseUrl = new URL(rawUrl);
  const hostname = databaseUrl.hostname.toLowerCase();
  const allowedHosts = new Set(['localhost', '127.0.0.1', '::1']);

  if (!allowedHosts.has(hostname)) {
    throw new Error(
      `PHASE_7_REFUSED: database non locale (${hostname}).`,
    );
  }

  const databaseName = databaseUrl.pathname.replace(/^\/+/, '');

  if (
    !databaseName ||
    ['postgres', 'template0', 'template1'].includes(databaseName)
  ) {
    throw new Error(
      `PHASE_7_REFUSED: database non valido (${databaseName || 'vuoto'}).`,
    );
  }

  return {
    connectionString: databaseUrl.toString(),
    ssl:
      process.env.DATABASE_SSL?.trim().toLowerCase() === 'true'
        ? { rejectUnauthorized: false }
        : false,
    databaseName,
    hostname,
  };
}

export function createLocalPool() {
  const config = localDatabaseConfig();

  return new Pool({
    connectionString: config.connectionString,
    ssl: config.ssl,
    max: 10,
  });
}

export async function waitForLocalDatabase(waitSeconds = 0) {
  const deadline = Date.now() + waitSeconds * 1_000;
  let lastError;

  do {
    const pool = createLocalPool();

    try {
      const result = await pool.query(`
        SELECT
          current_database() AS "databaseName",
          inet_server_addr()::text AS "serverAddress",
          current_user AS "databaseUser"
      `);
      const row = result.rows[0];

      return {
        databaseName: row?.databaseName,
        serverAddress: row?.serverAddress,
        databaseUser: row?.databaseUser,
      };
    } catch (error) {
      lastError = error;
    } finally {
      await pool.end().catch(() => undefined);
    }

    if (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  } while (Date.now() < deadline);

  throw lastError ?? new Error('Database locale non raggiungibile.');
}

async function main() {
  const waitArgumentIndex = process.argv.indexOf('--wait-seconds');
  const waitSeconds =
    waitArgumentIndex >= 0
      ? Number(process.argv[waitArgumentIndex + 1] ?? '0')
      : 0;

  if (!Number.isInteger(waitSeconds) || waitSeconds < 0) {
    throw new Error('--wait-seconds deve essere un intero non negativo.');
  }

  const connection = await waitForLocalDatabase(waitSeconds);

  console.log('Guard database locale: superato');
  console.log(`Database: ${connection.databaseName}`);
  console.log(`Server: ${connection.serverAddress ?? 'local socket'}`);
  console.log(`Utente: ${connection.databaseUser}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  });
}
