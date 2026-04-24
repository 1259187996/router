import { sql } from 'drizzle-orm';
import { db, pool } from '../src/db/client.js';
import { seedAdminUser } from '../test/helpers/login.js';

async function run() {
  await db.execute(sql`
    TRUNCATE TABLE
      price_snapshots,
      route_attempts,
      request_logs,
      api_tokens,
      channel_routes,
      logical_models,
      channels,
      user_sessions,
      users
    RESTART IDENTITY CASCADE
  `);

  const admin = await seedAdminUser(db);

  console.log(`Seeded E2E admin user ${admin.email}`);
}

try {
  await run();
} finally {
  await pool.end();
}
