import { ZodError } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { AuthServiceError } from '../modules/auth/service.js';

function sendAuthServiceError(error: AuthServiceError, reply: FastifyReply) {
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
  }
}

export function registerErrorHandler(fastify: FastifyInstance) {
  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({ error: 'Bad Request' });
      return;
    }

    if (error instanceof AuthServiceError) {
      sendAuthServiceError(error, reply);
      return;
    }

    if (error && typeof error === 'object' && 'code' in error && error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      reply.status(413).send({ error: 'Request body is too large' });
      return;
    }

    request.log.error({ err: error }, 'Unhandled request error');
    reply.status(500).send({ error: 'Internal Server Error' });
  });
}
