import argon2 from 'argon2';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { count, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { createTestDb } from '../helpers/test-db.js';
import * as schema from '../../src/db/schema/index.js';
import { userSessions, users } from '../../src/db/schema/index.js';
import { AuthRepository, type AppDb } from '../../src/modules/auth/repository.js';
import { AuthService } from '../../src/modules/auth/service.js';

const defaultTestDatabaseUrl = 'postgres://router:router@localhost:5432/router_test';

function buildDatabaseUrl(databaseName: string) {
  const url = new URL(process.env.TEST_DATABASE_URL ?? defaultTestDatabaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function getCurrentDatabaseName(db: AppDb) {
  const result = (await db.execute(sql`select current_database() as name`)) as unknown as {
    rows: Array<{ name: string }>;
  };

  return result.rows[0].name;
}

async function createPeerDb(databaseName: string) {
  const client = new Client({
    connectionString: buildDatabaseUrl(databaseName)
  });
  await client.connect();

  return {
    db: drizzle(client, { schema }),
    async stop() {
      await client.end();
    }
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

describe('auth repository integration', () => {
  const ctx = createTestDb();
  let databaseName: string;

  beforeAll(async () => {
    await ctx.start();
    databaseName = await getCurrentDatabaseName(ctx.db);
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('keeps at least one active admin when disabling the last two admins concurrently', async () => {
    const passwordHash = await argon2.hash('Admin123!Admin123!');
    const [firstAdmin, secondAdmin] = await ctx.db
      .insert(users)
      .values([
        {
          email: 'admin-one@example.com',
          displayName: 'Admin One',
          passwordHash,
          role: 'admin',
          status: 'active'
        },
        {
          email: 'admin-two@example.com',
          displayName: 'Admin Two',
          passwordHash,
          role: 'admin',
          status: 'active'
        }
      ])
      .returning();
    const peer = await createPeerDb(databaseName);
    const firstService = new AuthService(new AuthRepository(ctx.db));
    const secondService = new AuthService(new AuthRepository(peer.db));

    try {
      const results = await Promise.allSettled([
        firstService.updateUserStatus(firstAdmin.id, 'disabled'),
        secondService.updateUserStatus(secondAdmin.id, 'disabled')
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
      expect(results.find((result) => result.status === 'rejected')).toMatchObject({
        reason: {
          code: 'LAST_ADMIN'
        }
      });

      const [activeAdminCount] = await ctx.db
        .select({ value: count() })
        .from(users)
        .where(sql`${users.role} = 'admin' and ${users.status} = 'active'`);
      expect(activeAdminCount.value).toBe(1);
    } finally {
      await peer.stop();
    }
  });

  it('does not leave disabled users or stale sessions when session deletion rolls back', async () => {
    const passwordHash = await argon2.hash('Alice123!Alice123!');
    const [user] = await ctx.db
      .insert(users)
      .values({
        email: 'rollback-alice@example.com',
        displayName: 'Rollback Alice',
        passwordHash,
        role: 'user',
        status: 'active'
      })
      .returning();
    await ctx.db.insert(userSessions).values({
      userId: user.id,
      sessionTokenHash: 'rollback-session-hash',
      expiresAt: new Date(Date.now() + 60_000)
    });
    await ctx.db.execute(sql`
      create function fail_user_session_delete() returns trigger as $$
      begin
        raise exception 'forced session delete failure';
      end;
      $$ language plpgsql;
    `);
    await ctx.db.execute(sql`
      create trigger fail_user_session_delete
      before delete on user_sessions
      for each row execute function fail_user_session_delete();
    `);
    const service = new AuthService(new AuthRepository(ctx.db));

    try {
      await expect(service.updateUserStatus(user.id, 'disabled')).rejects.toThrow();

      const [storedUser] = await ctx.db.select().from(users).where(eq(users.id, user.id));
      const sessions = await ctx.db
        .select()
        .from(userSessions)
        .where(eq(userSessions.userId, user.id));
      expect(storedUser.status).toBe('active');
      expect(sessions).toHaveLength(1);
    } finally {
      await ctx.db.execute(sql`drop trigger if exists fail_user_session_delete on user_sessions`);
      await ctx.db.execute(sql`drop function if exists fail_user_session_delete()`);
    }
  });

  it('does not allow old-password login to create a valid session after password change', async () => {
    const oldPassword = 'Alice123!Alice123!';
    const newPassword = 'Alice456!Alice456!';
    const passwordHash = await argon2.hash(oldPassword);
    const [user] = await ctx.db
      .insert(users)
      .values({
        email: 'race-alice@example.com',
        displayName: 'Race Alice',
        passwordHash,
        role: 'user',
        status: 'active'
      })
      .returning();
    const service = new AuthService(new AuthRepository(ctx.db));
    const peer = await createPeerDb(databaseName);
    const peerService = new AuthService(new AuthRepository(peer.db));
    const originalVerify = argon2.verify;
    const loginVerifyStarted = deferred();
    const releaseLoginVerify = deferred();
    let blockedLoginVerify = false;
    const verifySpy = vi.spyOn(argon2, 'verify').mockImplementation(async (hash, plain, options) => {
      if (!blockedLoginVerify && plain === oldPassword) {
        blockedLoginVerify = true;
        loginVerifyStarted.resolve();
        await releaseLoginVerify.promise;
      }

      return originalVerify(hash, plain, options);
    });

    try {
      const staleLogin = service.login(user.email, oldPassword);
      await loginVerifyStarted.promise;
      const changePassword = peerService.changePassword(user.id, oldPassword, newPassword);
      await Promise.race([
        changePassword.catch(() => undefined),
        new Promise((resolve) => {
          setTimeout(resolve, 100);
        })
      ]);
      releaseLoginVerify.resolve();
      await changePassword;

      const staleLoginResult = await staleLogin;
      const authenticatedStaleSession = await service.authenticateSession(staleLoginResult.rawToken);

      expect(authenticatedStaleSession).toBeNull();
      await expect(service.login(user.email, oldPassword)).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS'
      });
      await expect(service.login(user.email, newPassword)).resolves.toMatchObject({
        user: {
          id: user.id
        }
      });
    } finally {
      verifySpy.mockRestore();
      await peer.stop();
    }
  });

  it('deletes a session created by a concurrent login when disabling the user', async () => {
    const password = 'Alice123!Alice123!';
    const passwordHash = await argon2.hash(password);
    const [user] = await ctx.db
      .insert(users)
      .values({
        email: 'disable-race-alice@example.com',
        displayName: 'Disable Race Alice',
        passwordHash,
        role: 'user',
        status: 'active'
      })
      .returning();
    const loginService = new AuthService(new AuthRepository(ctx.db));
    const peer = await createPeerDb(databaseName);
    const adminService = new AuthService(new AuthRepository(peer.db));
    const originalVerify = argon2.verify;
    const loginVerifyStarted = deferred();
    const releaseLoginVerify = deferred();
    let blockedLoginVerify = false;
    const verifySpy = vi.spyOn(argon2, 'verify').mockImplementation(async (hash, plain, options) => {
      if (!blockedLoginVerify && plain === password) {
        blockedLoginVerify = true;
        loginVerifyStarted.resolve();
        await releaseLoginVerify.promise;
      }

      return originalVerify(hash, plain, options);
    });

    try {
      const racingLogin = loginService.login(user.email, password);
      await loginVerifyStarted.promise;
      const disableUser = adminService.updateUserStatus(user.id, 'disabled');
      const disableCompletedBeforeLoginReleased = await Promise.race([
        disableUser.then(() => true),
        new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(false), 100);
        })
      ]);

      releaseLoginVerify.resolve();
      const loginResult = await racingLogin;
      await disableUser;
      await adminService.updateUserStatus(user.id, 'active');

      const authenticatedRacingSession = await loginService.authenticateSession(loginResult.rawToken);

      expect(disableCompletedBeforeLoginReleased).toBe(false);
      expect(authenticatedRacingSession).toBeNull();
    } finally {
      verifySpy.mockRestore();
      releaseLoginVerify.resolve();
      await peer.stop();
    }
  });
});
