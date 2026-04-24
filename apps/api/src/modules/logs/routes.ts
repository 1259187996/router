import { ZodError, z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { LogsService, LogsServiceError } from './service.js';

const logIdSchema = z.object({
  logId: z.string().uuid()
});

function sendRouteError(error: unknown, reply: FastifyReply) {
  if (error instanceof ZodError) {
    reply.status(400).send({ error: 'Bad Request' });
    return;
  }

  if (error instanceof LogsServiceError && error.code === 'LOG_NOT_FOUND') {
    reply.status(404).send({ error: 'Log not found' });
    return;
  }

  throw error;
}

export async function registerLogRoutes(fastify: FastifyInstance, logsService: LogsService) {
  fastify.get('/internal/logs', { preHandler: [fastify.requireSession] }, async (request, reply) => {
    try {
      const logs = await logsService.listLogs(request.currentUser!.id);
      reply.send({ logs });
    } catch (error) {
      sendRouteError(error, reply);
    }
  });

  fastify.get(
    '/internal/logs/:logId',
    { preHandler: [fastify.requireSession] },
    async (request, reply) => {
      try {
        const params = logIdSchema.parse(request.params);
        const detail = await logsService.getLogDetail(request.currentUser!.id, params.logId);
        reply.send(detail);
      } catch (error) {
        sendRouteError(error, reply);
      }
    }
  );
}
