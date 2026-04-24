import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { userSessions } from '../../src/db/schema/index.js';
import { createTestDb } from '../helpers/test-db.js';
import { adminEmail, adminPassword, seedAdminUser } from '../helpers/login.js';

describe('auth routes', () => {
  const ctx = createTestDb();
  let app: FastifyInstance;

  beforeAll(async () => {
    await ctx.start();
    app = await buildApp({ logger: false, db: ctx.db });
    await seedAdminUser(ctx.db);
  });

  afterAll(async () => {
    await app.close();
    await ctx.stop();
  });

  it('authenticates admins, manages users, and lets current users change password', async () => {
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: adminEmail,
        password: adminPassword
      }
    });

    expect(adminLogin.statusCode).toBe(200);
    expect(adminLogin.json()).toMatchObject({
      user: {
        email: adminEmail,
        displayName: 'Administrator',
        role: 'admin'
      }
    });
    expect(adminLogin.json().user).not.toHaveProperty('passwordHash');

    const adminSession = adminLogin.cookies.find((cookie) => cookie.name === 'router_session');
    expect(adminSession?.httpOnly).toBe(true);
    expect(adminSession?.sameSite).toBe('Lax');

    const storedSessions = await ctx.db.select().from(userSessions);
    expect(storedSessions).toHaveLength(1);
    expect(storedSessions[0].sessionTokenHash).toHaveLength(64);
    expect(storedSessions[0].sessionTokenHash).toBe(
      createHash('sha256').update(adminSession?.value ?? '').digest('hex')
    );
    expect(storedSessions[0].sessionTokenHash).not.toBe(adminSession?.value);

    const createUser = await app.inject({
      method: 'POST',
      url: '/internal/users',
      cookies: {
        router_session: adminSession?.value ?? ''
      },
      payload: {
        email: 'alice@example.com',
        displayName: 'Alice',
        password: 'Alice123!Alice123!',
        role: 'user'
      }
    });

    expect(createUser.statusCode).toBe(201);
    expect(createUser.json()).toMatchObject({
      user: {
        email: 'alice@example.com',
        displayName: 'Alice',
        role: 'user',
        status: 'active'
      }
    });
    expect(createUser.json().user).not.toHaveProperty('passwordHash');

    const duplicateUser = await app.inject({
      method: 'POST',
      url: '/internal/users',
      cookies: {
        router_session: adminSession?.value ?? ''
      },
      payload: {
        email: 'alice@example.com',
        displayName: 'Alice Duplicate',
        password: 'Alice789!Alice789!',
        role: 'user'
      }
    });
    expect(duplicateUser.statusCode).toBe(409);
    expect(duplicateUser.json()).toEqual({ error: 'User already exists' });

    const createdUserId = createUser.json().user.id as string;
    const userLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'alice@example.com',
        password: 'Alice123!Alice123!'
      }
    });

    expect(userLogin.statusCode).toBe(200);

    const userSession = userLogin.cookies.find((cookie) => cookie.name === 'router_session');
    expect(userSession?.value).toBeTruthy();

    const userCreateAttempt = await app.inject({
      method: 'POST',
      url: '/internal/users',
      cookies: {
        router_session: userSession?.value ?? ''
      },
      payload: {
        email: 'bob@example.com',
        displayName: 'Bob',
        password: 'Bob123!Bob123!',
        role: 'user'
      }
    });
    expect(userCreateAttempt.statusCode).toBe(403);

    const changePassword = await app.inject({
      method: 'POST',
      url: '/auth/change-password',
      cookies: {
        router_session: userSession?.value ?? ''
      },
      payload: {
        currentPassword: 'Alice123!Alice123!',
        newPassword: 'Alice456!Alice456!'
      }
    });

    expect(changePassword.statusCode).toBe(204);

    const changedPasswordOldSessionMe = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: {
        router_session: userSession?.value ?? ''
      }
    });
    expect(changedPasswordOldSessionMe.statusCode).toBe(401);

    const oldPasswordLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'alice@example.com',
        password: 'Alice123!Alice123!'
      }
    });
    expect(oldPasswordLogin.statusCode).toBe(401);

    const newPasswordLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'alice@example.com',
        password: 'Alice456!Alice456!'
      }
    });
    expect(newPasswordLogin.statusCode).toBe(200);

    const newUserSession = newPasswordLogin.cookies.find((cookie) => cookie.name === 'router_session');
    expect(newUserSession?.value).toBeTruthy();

    const disableUser = await app.inject({
      method: 'PATCH',
      url: `/internal/users/${createdUserId}/status`,
      cookies: {
        router_session: adminSession?.value ?? ''
      },
      payload: {
        status: 'disabled'
      }
    });

    expect(disableUser.statusCode).toBe(204);

    const disabledLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'alice@example.com',
        password: 'Alice456!Alice456!'
      }
    });
    expect(disabledLogin.statusCode).toBe(401);

    const disabledSessionMe = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: {
        router_session: newUserSession?.value ?? ''
      }
    });
    expect(disabledSessionMe.statusCode).toBe(401);

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: {
        router_session: adminSession?.value ?? ''
      }
    });
    expect(logout.statusCode).toBe(204);

    const loggedOutMe = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: {
        router_session: adminSession?.value ?? ''
      }
    });
    expect(loggedOutMe.statusCode).toBe(401);
  });

  it('does not leak unknown internal error messages', async () => {
    const originalLogin = app.authService.login;
    app.authService.login = async () => {
      throw new Error('secret database password leaked');
    };

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: adminEmail,
          password: adminPassword
        }
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: 'Internal Server Error' });
      expect(response.body).not.toContain('secret database password leaked');
    } finally {
      app.authService.login = originalLogin;
    }
  });

  it('prevents disabling the only active admin', async () => {
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: adminEmail,
        password: adminPassword
      }
    });
    const adminSession = adminLogin.cookies.find((cookie) => cookie.name === 'router_session');
    const adminId = adminLogin.json().user.id as string;

    const disableAdmin = await app.inject({
      method: 'PATCH',
      url: `/internal/users/${adminId}/status`,
      cookies: {
        router_session: adminSession?.value ?? ''
      },
      payload: {
        status: 'disabled'
      }
    });

    expect(disableAdmin.statusCode).toBe(409);

    const stillAdmin = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: {
        router_session: adminSession?.value ?? ''
      }
    });
    expect(stillAdmin.statusCode).toBe(200);
    expect(stillAdmin.json().user).toMatchObject({
      email: adminEmail,
      role: 'admin'
    });
  });
});
