import { eq } from 'drizzle-orm';
import { db, pool } from '../src/db/client.js';
import { env } from '../src/env.js';
import { users } from '../src/db/schema/index.js';

async function run() {
  const existing = await db.select().from(users).where(eq(users.email, env.ADMIN_EMAIL)).limit(1);

  if (existing.length > 0) {
    console.log(`Admin user ${env.ADMIN_EMAIL} already exists`);
    return;
  }

  await db.insert(users).values({
    email: env.ADMIN_EMAIL,
    displayName: 'Administrator',
    passwordHash: env.ADMIN_PASSWORD_HASH,
    role: 'admin',
    status: 'active'
  });

  console.log(`Seeded admin user ${env.ADMIN_EMAIL}`);
}

try {
  await run();
} finally {
  await pool.end();
}
