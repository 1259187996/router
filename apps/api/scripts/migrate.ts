import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { env } from '../src/env.js';
import * as schema from '../src/db/schema/index.js';

type PgError = Error & {
  code?: string;
};

function parseDatabaseName(connectionString: string) {
  return new URL(connectionString).pathname.replace(/^\//, '');
}

function buildAdminConnectionString(connectionString: string) {
  const url = new URL(connectionString);
  url.pathname = '/postgres';
  return url.toString();
}

function quoteIdentifier(identifier: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe PostgreSQL identifier: ${identifier}`);
  }

  return `"${identifier.replaceAll('"', '""')}"`;
}

async function ensureDatabaseExists(connectionString: string) {
  const databaseName = parseDatabaseName(connectionString);
  const adminClient = new Client({
    connectionString: buildAdminConnectionString(connectionString)
  });

  await adminClient.connect();

  try {
    await adminClient.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  } catch (error) {
    const pgError = error as PgError;

    if (pgError.code !== '42P04') {
      throw error;
    }
  } finally {
    await adminClient.end();
  }
}

async function run() {
  if (env.CREATE_DATABASE_BEFORE_MIGRATE) {
    await ensureDatabaseExists(env.DATABASE_URL);
  }

  const client = new Client({
    connectionString: env.DATABASE_URL
  });

  await client.connect();

  try {
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
  } finally {
    await client.end();
  }
}

await run();
