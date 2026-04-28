import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { buildApp } from '../../src/app.js';
import { apiTokens, logicalModels } from '../../src/db/schema/index.js';
import { AuthServiceError } from '../../src/modules/auth/service.js';
import { createTestDb } from '../helpers/test-db.js';
import { loginAsAdmin, seedLogicalModel } from '../helpers/login.js';

describe('token routes', () => {
  const db = createTestDb();
  let userCounter = 0;

  async function createAndLoginUser(app: Awaited<ReturnType<typeof buildApp>>, adminCookie: string) {
    userCounter += 1;
    const email = `token-user-${userCounter}@example.com`;
    const password = `Password${userCounter}!Password${userCounter}!`;

    const createUser = await app.inject({
      method: 'POST',
      url: '/internal/users',
      headers: { cookie: adminCookie },
      payload: {
        email,
        displayName: `Token User ${userCounter}`,
        password,
        role: 'user'
      }
    });

    expect(createUser.statusCode).toBe(201);

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password }
    });

    expect(login.statusCode).toBe(200);

    const sessionCookie = login.cookies.find((cookie) => cookie.name === 'router_session');

    expect(sessionCookie?.value).toBeTruthy();

    return `${sessionCookie?.name}=${sessionCookie?.value}`;
  }

  async function registerGatewayProbeRoute(app: Awaited<ReturnType<typeof buildApp>>) {
    await app.get('/_test/gateway-auth', async (request, reply) => {
      try {
        await (app as typeof app & {
          requireGatewayToken: (request: FastifyRequest) => Promise<void>;
        }).requireGatewayToken(request);

        reply.send({
          tokenId: (request as FastifyRequest & { gatewayToken: { id: string } }).gatewayToken.id
        });
      } catch (error) {
        if (!(error instanceof AuthServiceError) || error.code !== 'INVALID_CREDENTIALS') {
          throw error;
        }

        reply.status(401).send({
          error: 'Unauthorized',
          gatewayToken: request.gatewayToken
        });
      }
    });
  }

  beforeAll(db.start);
  afterAll(db.stop);

  it('creates a token and returns the recoverable raw secret without exposing the hash', async () => {
    const app = await buildApp({ logger: false, db: db.db });

    try {
      const { cookie } = await loginAsAdmin(app);
      const logicalModelId = await seedLogicalModel(db.db);

      const create = await app.inject({
        method: 'POST',
        url: '/internal/tokens',
        headers: { cookie },
        payload: {
          name: 'sdk',
          logicalModelId,
          budgetLimitUsd: '50.00',
          expiresAt: '2026-12-31T00:00:00.000Z'
        }
      });

      expect(create.statusCode).toBe(201);
      const createdToken = create.json().token as {
        id: string;
        rawToken: string;
      };

      expect(createdToken.rawToken.startsWith('rt_')).toBe(true);
      expect(create.json().token.logicalModelAlias).toBeUndefined();

      const [storedToken] = await db.db
        .select()
        .from(apiTokens)
        .where(eq(apiTokens.id, createdToken.id))
        .limit(1);

      const expectedHash = createHash('sha256').update(createdToken.rawToken).digest('hex');

      expect(storedToken.tokenHash).toBe(expectedHash);
      expect(storedToken.tokenHash).not.toBe(createdToken.rawToken);
      expect(storedToken.tokenEncrypted).not.toBe(createdToken.rawToken);
      expect(storedToken.tokenEncrypted).toBeTruthy();
      expect(JSON.stringify(storedToken)).not.toContain(createdToken.rawToken);

      const list = await app.inject({
        method: 'GET',
        url: '/internal/tokens',
        headers: { cookie }
      });

      expect(list.statusCode).toBe(200);
      expect(list.json().tokens[0]).toMatchObject({
        name: 'sdk',
        logicalModelId,
        budgetLimitUsd: '50.00',
        budgetUsedUsd: '0.00',
        budgetStatus: 'available',
        status: 'active'
      });
      expect(list.json().tokens[0].rawToken).toBe(createdToken.rawToken);
      expect(list.json().tokens[0].tokenHash).toBeUndefined();
      expect(list.json().tokens[0].tokenEncrypted).toBeUndefined();
      expect(list.json().tokens[0].logicalModelAlias).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it('deletes a token and rejects it for gateway bearer auth', async () => {
    const app = await buildApp({ logger: false, db: db.db });
    await registerGatewayProbeRoute(app);

    try {
      const { cookie } = await loginAsAdmin(app);
      const logicalModelId = await seedLogicalModel(db.db);

      const create = await app.inject({
        method: 'POST',
        url: '/internal/tokens',
        headers: { cookie },
        payload: {
          name: 'gateway',
          logicalModelId,
          budgetLimitUsd: '25.00'
        }
      });

      expect(create.statusCode).toBe(201);

      const rawToken = create.json().token.rawToken as string;
      const tokenId = create.json().token.id as string;

      const authorized = await app.inject({
        method: 'GET',
        url: '/_test/gateway-auth',
        headers: {
          authorization: `Bearer ${rawToken}`
        }
      });

      expect(authorized.statusCode).toBe(200);
      expect(authorized.json()).toEqual({ tokenId });

      const lowerCaseAuthorized = await app.inject({
        method: 'GET',
        url: '/_test/gateway-auth',
        headers: {
          authorization: `bearer ${rawToken}`
        }
      });

      expect(lowerCaseAuthorized.statusCode).toBe(200);
      expect(lowerCaseAuthorized.json()).toEqual({ tokenId });

      const deleteToken = await app.inject({
        method: 'DELETE',
        url: `/internal/tokens/${tokenId}`,
        headers: { cookie }
      });

      expect(deleteToken.statusCode).toBe(204);

      const list = await app.inject({
        method: 'GET',
        url: '/internal/tokens',
        headers: { cookie }
      });

      expect(list.statusCode).toBe(200);
      expect(list.json().tokens.find((token: { id: string }) => token.id === tokenId)).toBeUndefined();

      const [storedTokenAfterDelete] = await db.db
        .select()
        .from(apiTokens)
        .where(eq(apiTokens.id, tokenId))
        .limit(1);

      expect(storedTokenAfterDelete).toBeUndefined();

      const rejected = await app.inject({
        method: 'GET',
        url: '/_test/gateway-auth',
        headers: {
          authorization: `Bearer ${rawToken}`
        }
      });

      expect(rejected.statusCode).toBe(401);
      expect(rejected.json()).toEqual({
        error: 'Unauthorized',
        gatewayToken: null
      });
    } finally {
      await app.close();
    }
  });

  it('gets and updates a token while keeping its raw secret available for display', async () => {
    const app = await buildApp({ logger: false, db: db.db });

    try {
      const { cookie } = await loginAsAdmin(app);
      const logicalModelId = await seedLogicalModel(db.db);
      const replacementLogicalModelId = await seedLogicalModel(db.db);

      const create = await app.inject({
        method: 'POST',
        url: '/internal/tokens',
        headers: { cookie },
        payload: {
          name: 'editable-token',
          logicalModelId,
          budgetLimitUsd: '10.00'
        }
      });

      expect(create.statusCode).toBe(201);
      const tokenId = create.json().token.id as string;
      const rawToken = create.json().token.rawToken as string;

      const detail = await app.inject({
        method: 'GET',
        url: `/internal/tokens/${tokenId}`,
        headers: { cookie }
      });

      expect(detail.statusCode).toBe(200);
      expect(detail.json().token).toMatchObject({
        id: tokenId,
        name: 'editable-token',
        logicalModelId,
        budgetLimitUsd: '10.00',
        status: 'active'
      });
      expect(detail.json().token.rawToken).toBe(rawToken);
      expect(detail.json().token.tokenHash).toBeUndefined();
      expect(detail.json().token.tokenEncrypted).toBeUndefined();

      const update = await app.inject({
        method: 'PATCH',
        url: `/internal/tokens/${tokenId}`,
        headers: { cookie },
        payload: {
          name: 'edited-token',
          logicalModelId: replacementLogicalModelId,
          budgetLimitUsd: '25.50',
          expiresAt: '2026-12-31T00:00:00.000Z',
          status: 'active'
        }
      });

      expect(update.statusCode).toBe(200);
      expect(update.json().token).toMatchObject({
        id: tokenId,
        name: 'edited-token',
        logicalModelId: replacementLogicalModelId,
        budgetLimitUsd: '25.50',
        budgetUsedUsd: '0.00',
        budgetStatus: 'available',
        status: 'active',
        expiresAt: '2026-12-31T00:00:00.000Z'
      });
      expect(update.json().token.rawToken).toBe(rawToken);
      expect(update.json().token.tokenHash).toBeUndefined();
      expect(update.json().token.tokenEncrypted).toBeUndefined();

      const list = await app.inject({
        method: 'GET',
        url: '/internal/tokens',
        headers: { cookie }
      });

      expect(list.statusCode).toBe(200);
      expect(list.json().tokens[0]).toMatchObject({
        id: tokenId,
        name: 'edited-token',
        logicalModelId: replacementLogicalModelId,
        budgetLimitUsd: '25.50'
      });
    } finally {
      await app.close();
    }
  });

  it('isolates token routes by user ownership', async () => {
    const app = await buildApp({ logger: false, db: db.db });

    try {
      const { cookie: adminCookie } = await loginAsAdmin(app);
      const otherUserCookie = await createAndLoginUser(app, adminCookie);
      const logicalModelId = await seedLogicalModel(db.db);

      const create = await app.inject({
        method: 'POST',
        url: '/internal/tokens',
        headers: { cookie: otherUserCookie },
        payload: {
          name: 'foreign-logical-model',
          logicalModelId,
          budgetLimitUsd: '10.00'
        }
      });

      expect(create.statusCode).toBe(404);

      const ownerCreate = await app.inject({
        method: 'POST',
        url: '/internal/tokens',
        headers: { cookie: adminCookie },
        payload: {
          name: 'owner-token',
          logicalModelId,
          budgetLimitUsd: '10.00'
        }
      });

      expect(ownerCreate.statusCode).toBe(201);

      const otherList = await app.inject({
        method: 'GET',
        url: '/internal/tokens',
        headers: { cookie: otherUserCookie }
      });

      expect(otherList.statusCode).toBe(200);
      expect(otherList.json().tokens).toEqual([]);

      const deleteByOtherUser = await app.inject({
        method: 'DELETE',
        url: `/internal/tokens/${ownerCreate.json().token.id as string}`,
        headers: { cookie: otherUserCookie }
      });

      expect(deleteByOtherUser.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('rejects turning a token into a revoked status through update', async () => {
    const app = await buildApp({ logger: false, db: db.db });

    try {
      const { cookie } = await loginAsAdmin(app);
      const logicalModelId = await seedLogicalModel(db.db);

      const create = await app.inject({
        method: 'POST',
        url: '/internal/tokens',
        headers: { cookie },
        payload: {
          name: 'delete-only-token',
          logicalModelId,
          budgetLimitUsd: '10.00'
        }
      });

      expect(create.statusCode).toBe(201);

      const update = await app.inject({
        method: 'PATCH',
        url: `/internal/tokens/${create.json().token.id as string}`,
        headers: { cookie },
        payload: {
          status: 'revoked'
        }
      });

      expect(update.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('rejects creating a token for a disabled logical model', async () => {
    const app = await buildApp({ logger: false, db: db.db });

    try {
      const { cookie } = await loginAsAdmin(app);
      const logicalModelId = await seedLogicalModel(db.db);

      await db.db
        .update(logicalModels)
        .set({
          status: 'disabled',
          updatedAt: new Date()
        })
        .where(eq(logicalModels.id, logicalModelId));

      const create = await app.inject({
        method: 'POST',
        url: '/internal/tokens',
        headers: { cookie },
        payload: {
          name: 'disabled-model-token',
          logicalModelId,
          budgetLimitUsd: '10.00'
        }
      });

      expect(create.statusCode).toBe(404);
      expect(create.json()).toEqual({ error: 'Not Found' });
    } finally {
      await app.close();
    }
  });

  it('rejects gateway bearer auth for budget exhausted tokens', async () => {
    const app = await buildApp({ logger: false, db: db.db });
    await registerGatewayProbeRoute(app);

    try {
      const { cookie } = await loginAsAdmin(app);
      const logicalModelId = await seedLogicalModel(db.db);

      const create = await app.inject({
        method: 'POST',
        url: '/internal/tokens',
        headers: { cookie },
        payload: {
          name: 'exhaust-me',
          logicalModelId,
          budgetLimitUsd: '5.00'
        }
      });

      expect(create.statusCode).toBe(201);

      const tokenId = create.json().token.id as string;
      const rawToken = create.json().token.rawToken as string;

      await db.db
        .update(apiTokens)
        .set({
          budgetUsedUsd: '5.00',
          updatedAt: new Date()
        })
        .where(eq(apiTokens.id, tokenId));

      const list = await app.inject({
        method: 'GET',
        url: '/internal/tokens',
        headers: { cookie }
      });

      expect(list.statusCode).toBe(200);
      expect(list.json().tokens[0]).toMatchObject({
        id: tokenId,
        budgetLimitUsd: '5.00',
        budgetUsedUsd: '5.00',
        budgetStatus: 'exhausted'
      });

      const gateway = await app.inject({
        method: 'GET',
        url: '/_test/gateway-auth',
        headers: {
          authorization: `Bearer ${rawToken}`
        }
      });

      expect(gateway.statusCode).toBe(401);
      expect(gateway.json()).toEqual({
        error: 'Unauthorized',
        gatewayToken: null
      });
    } finally {
      await app.close();
    }
  });

  it('lists tokens with budgetStatus exhausted when the persisted token status is exhausted', async () => {
    const app = await buildApp({ logger: false, db: db.db });

    try {
      const { cookie } = await loginAsAdmin(app);
      const logicalModelId = await seedLogicalModel(db.db);

      const create = await app.inject({
        method: 'POST',
        url: '/internal/tokens',
        headers: { cookie },
        payload: {
          name: 'persisted-exhausted-token',
          logicalModelId,
          budgetLimitUsd: '5.00'
        }
      });

      expect(create.statusCode).toBe(201);

      const tokenId = create.json().token.id as string;

      await db.db
        .update(apiTokens)
        .set({
          status: 'exhausted',
          budgetUsedUsd: '1.00',
          updatedAt: new Date()
        })
        .where(eq(apiTokens.id, tokenId));

      const list = await app.inject({
        method: 'GET',
        url: '/internal/tokens',
        headers: { cookie }
      });

      expect(list.statusCode).toBe(200);
      expect(list.json().tokens[0]).toMatchObject({
        id: tokenId,
        status: 'exhausted',
        budgetLimitUsd: '5.00',
        budgetUsedUsd: '1.00',
        budgetStatus: 'exhausted'
      });
    } finally {
      await app.close();
    }
  });

  it('rejects gateway bearer auth when the authorization header is missing', async () => {
    const app = await buildApp({ logger: false, db: db.db });
    await registerGatewayProbeRoute(app);

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/_test/gateway-auth'
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: 'Unauthorized',
        gatewayToken: null
      });
    } finally {
      await app.close();
    }
  });

  it('rejects gateway bearer auth for blank or malformed bearer values', async () => {
    const app = await buildApp({ logger: false, db: db.db });
    await registerGatewayProbeRoute(app);

    try {
      const blankBearer = await app.inject({
        method: 'GET',
        url: '/_test/gateway-auth',
        headers: {
          authorization: 'Bearer    '
        }
      });

      expect(blankBearer.statusCode).toBe(401);
      expect(blankBearer.json()).toEqual({
        error: 'Unauthorized',
        gatewayToken: null
      });

      const malformedBearer = await app.inject({
        method: 'GET',
        url: '/_test/gateway-auth',
        headers: {
          authorization: 'Basic not-a-bearer-token'
        }
      });

      expect(malformedBearer.statusCode).toBe(401);
      expect(malformedBearer.json()).toEqual({
        error: 'Unauthorized',
        gatewayToken: null
      });
    } finally {
      await app.close();
    }
  });

  it('rejects gateway bearer auth for expired timestamps and expired statuses', async () => {
    const app = await buildApp({ logger: false, db: db.db });
    await registerGatewayProbeRoute(app);

    try {
      const { cookie } = await loginAsAdmin(app);
      const logicalModelId = await seedLogicalModel(db.db);

      const expiredAtCreate = await app.inject({
        method: 'POST',
        url: '/internal/tokens',
        headers: { cookie },
        payload: {
          name: 'expired-at',
          logicalModelId,
          budgetLimitUsd: '10.00',
          expiresAt: '2000-01-01T00:00:00.000Z'
        }
      });

      expect(expiredAtCreate.statusCode).toBe(201);

      const expiredAtAuth = await app.inject({
        method: 'GET',
        url: '/_test/gateway-auth',
        headers: {
          authorization: `Bearer ${expiredAtCreate.json().token.rawToken as string}`
        }
      });

      expect(expiredAtAuth.statusCode).toBe(401);
      expect(expiredAtAuth.json()).toEqual({
        error: 'Unauthorized',
        gatewayToken: null
      });

      const expiredStatusCreate = await app.inject({
        method: 'POST',
        url: '/internal/tokens',
        headers: { cookie },
        payload: {
          name: 'expired-status',
          logicalModelId,
          budgetLimitUsd: '10.00'
        }
      });

      expect(expiredStatusCreate.statusCode).toBe(201);

      await db.db
        .update(apiTokens)
        .set({
          status: 'expired',
          updatedAt: new Date()
        })
        .where(eq(apiTokens.id, expiredStatusCreate.json().token.id as string));

      const expiredStatusAuth = await app.inject({
        method: 'GET',
        url: '/_test/gateway-auth',
        headers: {
          authorization: `Bearer ${expiredStatusCreate.json().token.rawToken as string}`
        }
      });

      expect(expiredStatusAuth.statusCode).toBe(401);
      expect(expiredStatusAuth.json()).toEqual({
        error: 'Unauthorized',
        gatewayToken: null
      });
    } finally {
      await app.close();
    }
  });

  it('rejects gateway bearer auth for exhausted database statuses', async () => {
    const app = await buildApp({ logger: false, db: db.db });
    await registerGatewayProbeRoute(app);

    try {
      const { cookie } = await loginAsAdmin(app);
      const logicalModelId = await seedLogicalModel(db.db);

      const create = await app.inject({
        method: 'POST',
        url: '/internal/tokens',
        headers: { cookie },
        payload: {
          name: 'status-exhausted',
          logicalModelId,
          budgetLimitUsd: '10.00'
        }
      });

      expect(create.statusCode).toBe(201);

      await db.db
        .update(apiTokens)
        .set({
          status: 'exhausted',
          updatedAt: new Date()
        })
        .where(eq(apiTokens.id, create.json().token.id as string));

      const response = await app.inject({
        method: 'GET',
        url: '/_test/gateway-auth',
        headers: {
          authorization: `Bearer ${create.json().token.rawToken as string}`
        }
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: 'Unauthorized',
        gatewayToken: null
      });
    } finally {
      await app.close();
    }
  });
});
