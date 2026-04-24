import { ZodError } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  changePasswordSchema,
  createUserSchema,
  loginBodySchema,
  updateUserStatusSchema,
  userIdSchema
} from './schema.js';
import { AuthServiceError } from './service.js';
import { sessionCookieName, sessionCookieOptions } from '../../plugins/session.js';

function toUserResponse(user: {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  status?: 'active' | 'disabled';
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    ...(user.status ? { status: user.status } : {})
  };
}

function sendRouteError(error: unknown, reply: FastifyReply) {
  if (error instanceof ZodError) {
    reply.status(400).send({ error: 'Bad Request' });
    return;
  }

  if (error instanceof AuthServiceError) {
    if (error.code === 'INVALID_CREDENTIALS') {
      reply.status(401).send({ error: 'Unauthorized' });
      return;
    }

    if (error.code === 'USER_ALREADY_EXISTS') {
      reply.status(409).send({ error: 'User already exists' });
      return;
    }

    if (error.code === 'LAST_ADMIN') {
      reply.status(409).send({ error: 'Cannot disable the last active admin' });
      return;
    }

    if (error.code === 'USER_NOT_FOUND') {
      reply.status(404).send({ error: 'User not found' });
      return;
    }
  }

  throw error;
}

export async function registerAuthRoutes(fastify: FastifyInstance) {
  fastify.post('/auth/login', async (request, reply) => {
    try {
      const body = loginBodySchema.parse(request.body);
      const session = await fastify.authService.login(body.email, body.password);

      reply.setCookie(sessionCookieName, session.rawToken, {
        ...sessionCookieOptions,
        expires: session.expiresAt
      });

      return {
        user: toUserResponse(session.user)
      };
    } catch (error) {
      sendRouteError(error, reply);
    }
  });

  fastify.get('/auth/me', { preHandler: [fastify.requireSession] }, async (request) => ({
    user: request.currentUser ? toUserResponse(request.currentUser) : null
  }));

  fastify.post('/auth/logout', { preHandler: [fastify.requireSession] }, async (request, reply) => {
    const rawToken = request.cookies[sessionCookieName];

    if (rawToken) {
      await fastify.authService.logout(rawToken);
    }

    reply.clearCookie(sessionCookieName, sessionCookieOptions);
    reply.status(204).send();
  });

  fastify.post(
    '/auth/change-password',
    { preHandler: [fastify.requireSession] },
    async (request, reply) => {
      try {
        const body = changePasswordSchema.parse(request.body);

        await fastify.authService.changePassword(
          request.currentUser!.id,
          body.currentPassword,
          body.newPassword
        );

        reply.clearCookie(sessionCookieName, sessionCookieOptions);
        reply.status(204).send();
      } catch (error) {
        sendRouteError(error, reply);
      }
    }
  );

  fastify.post('/internal/users', { preHandler: [fastify.requireAdmin] }, async (request, reply) => {
    try {
      const body = createUserSchema.parse(request.body);
      const user = await fastify.authService.createUser(body);

      reply.status(201).send({
        user: toUserResponse(user)
      });
    } catch (error) {
      sendRouteError(error, reply);
    }
  });

  fastify.patch(
    '/internal/users/:userId/status',
    { preHandler: [fastify.requireAdmin] },
    async (request, reply) => {
      try {
        const params = userIdSchema.parse(request.params);
        const body = updateUserStatusSchema.parse(request.body);

        await fastify.authService.updateUserStatus(params.userId, body.status);

        reply.status(204).send();
      } catch (error) {
        sendRouteError(error, reply);
      }
    }
  );
}
