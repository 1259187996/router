import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppDb } from '../modules/auth/repository.js';
import type { AuthService, PublicUser } from '../modules/auth/service.js';
import { env } from '../env.js';

export const sessionCookieName = 'router_session';
export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: env.SESSION_COOKIE_SECURE,
  maxAge: 7 * 24 * 60 * 60
};

declare module 'fastify' {
  interface FastifyInstance {
    db: AppDb;
    authService: AuthService;
    requireSession: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    currentUser: PublicUser | null;
    currentSessionTokenHash: string | null;
  }
}

export async function registerSessionPlugin(fastify: FastifyInstance, authService: AuthService) {
  fastify.decorate('authService', authService);
  fastify.decorateRequest('currentUser', null);
  fastify.decorateRequest('currentSessionTokenHash', null);

  fastify.decorate('requireSession', async (request: FastifyRequest, reply: FastifyReply) => {
    const rawToken = request.cookies[sessionCookieName];

    if (!rawToken) {
      reply.status(401).send({ error: 'Unauthorized' });
      return;
    }

    const session = await authService.authenticateSession(rawToken);

    if (!session) {
      reply.status(401).send({ error: 'Unauthorized' });
      return;
    }

    request.currentUser = session.user;
    request.currentSessionTokenHash = session.sessionTokenHash;
  });

  fastify.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    await fastify.requireSession(request, reply);

    if (reply.sent) {
      return;
    }

    if (request.currentUser?.role !== 'admin') {
      reply.status(403).send({ error: 'Forbidden' });
    }
  });
}
