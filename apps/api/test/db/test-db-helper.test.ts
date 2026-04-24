import { describe, expect, it } from 'vitest';
import { createTestDb } from '../helpers/test-db.js';
import { users } from '../../src/db/schema/index.js';

describe('createTestDb', () => {
  it('starts isolated database contexts concurrently', async () => {
    const first = createTestDb();
    const second = createTestDb();

    try {
      await Promise.all([first.start(), second.start()]);

      await Promise.all([
        first.db.insert(users).values({
          email: 'first@example.com',
          displayName: 'First',
          passwordHash: 'hash',
          role: 'user',
          status: 'active'
        }),
        second.db.insert(users).values({
          email: 'second@example.com',
          displayName: 'Second',
          passwordHash: 'hash',
          role: 'user',
          status: 'active'
        })
      ]);

      const [firstRows, secondRows] = await Promise.all([
        first.db.select().from(users),
        second.db.select().from(users)
      ]);

      expect(firstRows).toHaveLength(1);
      expect(secondRows).toHaveLength(1);
    } finally {
      await Promise.allSettled([first.stop(), second.stop()]);
    }
  });
});
