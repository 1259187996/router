import { ZodError, z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { LogsService, LogsServiceError } from './service.js';

const logIdSchema = z.object({
  logId: z.string().uuid()
});

const listLogsQuerySchema = z.object({
  apiTokenId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20)
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
      const query = listLogsQuerySchema.parse(request.query);
      const result = await logsService.listLogs(request.currentUser!.id, query);
      reply.send(result);
    } catch (error) {
      sendRouteError(error, reply);
    }
  });

  fastify.get('/internal/overview', { preHandler: [fastify.requireSession] }, async (request, reply) => {
    try {
      const overview = await logsService.getOverview(request.currentUser!.id);
      reply.send(overview);
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
