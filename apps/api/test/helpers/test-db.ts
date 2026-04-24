import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { loadEnvFiles } from '../../src/load-env.js';
import * as schema from '../../src/db/schema/index.js';

loadEnvFiles();

const defaultTestDatabaseUrl = 'postgres://router:router@localhost:5432/router_test';

type PgError = Error & {
  code?: string;
};

function quoteIdentifier(identifier: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe PostgreSQL identifier: ${identifier}`);
  }

  return `"${identifier.replaceAll('"', '""')}"`;
}

function buildAdminConnectionString(connectionString: string) {
  const url = new URL(connectionString);
  url.pathname = '/postgres';
  return url.toString();
}

function buildUniqueDatabaseUrl(connectionString: string) {
  const url = new URL(connectionString);
  const baseName = url.pathname.replace(/^\//, '') || 'router_test';
  const safeBaseName = baseName.replaceAll(/[^A-Za-z0-9_]/g, '_').slice(0, 24) || 'router_test';
  const uniqueName = `${safeBaseName}_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 16)}`;

  url.pathname = `/${uniqueName}`;

  return {
    databaseName: uniqueName,
    connectionString: url.toString()
  };
}

async function createDatabase(adminConnectionString: string, databaseName: string) {
  const adminClient = new Client({
    connectionString: adminConnectionString
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

async function dropDatabase(adminConnectionString: string, databaseName: string) {
  const adminClient = new Client({
    connectionString: adminConnectionString
  });

  await adminClient.connect();

  try {
    await adminClient.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`);
  } finally {
    await adminClient.end();
  }
}

export function createTestDb() {
  let client: Client | null = null;
  let db: NodePgDatabase<typeof schema> | null = null;
  let adminConnectionString: string | null = null;
  let databaseName: string | null = null;

  return {
    get db() {
      if (!db) {
        throw new Error('Test database not started');
      }

      return db;
    },
    async start() {
      const baseConnectionString = process.env.TEST_DATABASE_URL ?? defaultTestDatabaseUrl;
      const testDatabase = buildUniqueDatabaseUrl(baseConnectionString);
      adminConnectionString = buildAdminConnectionString(baseConnectionString);
      databaseName = testDatabase.databaseName;

      await createDatabase(adminConnectionString, databaseName);

      client = new Client({
        connectionString: testDatabase.connectionString
      });

      try {
        await client.connect();
        db = drizzle(client, { schema });

        await migrate(db, {
          migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url))
        });
      } catch (error) {
        await client.end();
        client = null;
        db = null;
        await dropDatabase(adminConnectionString, databaseName);
        databaseName = null;
        throw error;
      }
    },
    async stop() {
      if (client) {
        await client.end();
      }

      if (adminConnectionString && databaseName) {
        await dropDatabase(adminConnectionString, databaseName);
      }

      db = null;
      client = null;
      adminConnectionString = null;
      databaseName = null;
    }
  };
}
