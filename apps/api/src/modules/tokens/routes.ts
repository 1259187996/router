import { ZodError } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { createTokenSchema, tokenIdSchema } from './schema.js';
import { TokenService, TokenServiceError, type PublicTokenResponse } from './service.js';

function sendRouteError(error: unknown, reply: FastifyReply) {
  if (error instanceof ZodError) {
    reply.status(400).send({ error: 'Bad Request' });
    return;
  }

  if (error instanceof TokenServiceError) {
    if (error.code === 'LOGICAL_MODEL_NOT_FOUND') {
      reply.status(404).send({ error: 'Not Found' });
      return;
    }

    if (error.code === 'TOKEN_NOT_FOUND') {
      reply.status(404).send({ error: 'Token not found' });
      return;
    }

    if (error.code === 'UNAUTHORIZED_GATEWAY_TOKEN') {
      reply.status(401).send({ error: 'Unauthorized' });
      return;
    }
  }

  throw error;
}

function toTokenResponse(token: PublicTokenResponse) {
  return token;
}

export async function registerTokenRoutes(fastify: FastifyInstance, tokenService: TokenService) {
  fastify.post('/internal/tokens', { preHandler: [fastify.requireSession] }, async (request, reply) => {
    try {
      const body = createTokenSchema.parse(request.body);
      const token = await tokenService.createToken(request.currentUser!.id, body);

      reply.status(201).send({
        token: toTokenResponse(token)
      });
    } catch (error) {
      sendRouteError(error, reply);
    }
  });

  fastify.get('/internal/tokens', { preHandler: [fastify.requireSession] }, async (request, reply) => {
    try {
      const tokens = await tokenService.listTokens(request.currentUser!.id);
      reply.send({
        tokens: tokens.map((token) => toTokenResponse(token))
      });
    } catch (error) {
      sendRouteError(error, reply);
    }
  });

  fastify.delete(
    '/internal/tokens/:tokenId',
    { preHandler: [fastify.requireSession] },
    async (request, reply) => {
      try {
        const params = tokenIdSchema.parse(request.params);
        await tokenService.revokeToken(request.currentUser!.id, params.tokenId);
        reply.status(204).send();
      } catch (error) {
        sendRouteError(error, reply);
      }
    }
  );
}
