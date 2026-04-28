import { ZodError } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  channelIdParamsSchema,
  channelModelIdParamsSchema,
  createChannelModelSchema,
  createChannelSchema,
  createLogicalModelSchema,
  logicalModelIdParamsSchema,
  updateChannelModelSchema,
  updateChannelSchema,
  updateLogicalModelSchema
} from './schema.js';
import { ChannelsService, ChannelsServiceError } from './service.js';

function toChannelResponse(channel: {
  id: string;
  userId?: string;
  name: string;
  provider: string;
  baseUrl: string;
  defaultModelId: string;
  status: 'active' | 'disabled';
  lastTestStatus: string | null;
  lastTestError: string | null;
  lastTestedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return channel;
}

function toLogicalModelResponse(logicalModel: {
  id: string;
  alias: string;
  description: string;
  status: 'active' | 'disabled';
  createdAt: Date;
  updatedAt: Date;
    routes?: Array<{
      id: string;
      channelId: string;
      channelModelId?: string | null;
      upstreamModelId: string | null;
    inputPricePer1m: string;
    cachedInputPricePer1m: string;
    outputPricePer1m: string;
    currency: string;
    priority: number;
    status: 'active' | 'disabled';
    channelName: string;
  }>;
}) {
  return logicalModel;
}

function sendRouteError(error: unknown, reply: FastifyReply) {
  if (error instanceof ZodError) {
    reply.status(400).send({ error: 'Bad Request' });
    return;
  }

  if (error instanceof ChannelsServiceError) {
    if (
      error.code === 'INVALID_CHANNEL_BASE_URL' ||
      error.code === 'UNSAFE_CHANNEL_BASE_URL'
    ) {
      reply.status(400).send({ error: 'Bad Request' });
      return;
    }

    if (error.code === 'CHANNEL_NOT_FOUND' || error.code === 'INVALID_ROUTE_CHANNEL') {
      reply.status(404).send({ error: 'Channel not found' });
      return;
    }

    if (error.code === 'CHANNEL_MODEL_NOT_FOUND') {
      reply.status(404).send({ error: 'Channel model not found' });
      return;
    }

    if (error.code === 'LOGICAL_MODEL_NOT_FOUND') {
      reply.status(404).send({ error: 'Logical model not found' });
      return;
    }

    if (error.code === 'LOGICAL_MODEL_ALIAS_EXISTS') {
      reply.status(409).send({ error: 'Logical model alias already exists' });
      return;
    }

    if (error.code === 'CHANNEL_TEST_FAILED') {
      reply.status(502).send({ error: 'Channel test failed' });
      return;
    }
  }

  throw error;
}

export async function registerChannelRoutes(
  fastify: FastifyInstance,
  channelsService: ChannelsService
) {
  fastify.get('/internal/channels', { preHandler: [fastify.requireSession] }, async (request, reply) => {
    try {
      const channels = await channelsService.listChannels(request.currentUser!.id);
      reply.send({ channels: channels.map((channel) => toChannelResponse(channel)) });
    } catch (error) {
      sendRouteError(error, reply);
    }
  });

  fastify.post('/internal/channels', { preHandler: [fastify.requireSession] }, async (request, reply) => {
    try {
      const body = createChannelSchema.parse(request.body);
      const channel = await channelsService.createChannel(request.currentUser!.id, body);

      reply.status(201).send({
        channel: toChannelResponse({
          id: channel.id,
          userId: channel.userId,
          name: channel.name,
          provider: channel.provider,
          baseUrl: channel.baseUrl,
          defaultModelId: channel.defaultModelId,
          status: channel.status,
          lastTestStatus: channel.lastTestStatus,
          lastTestError: channel.lastTestError,
          lastTestedAt: channel.lastTestedAt,
          createdAt: channel.createdAt,
          updatedAt: channel.updatedAt
        })
      });
    } catch (error) {
      sendRouteError(error, reply);
    }
  });

  fastify.get(
    '/internal/channels/:channelId',
    { preHandler: [fastify.requireSession] },
    async (request, reply) => {
      try {
        const params = channelIdParamsSchema.parse(request.params);
        const detail = await channelsService.getChannelDetail(request.currentUser!.id, params.channelId);

        reply.send(detail);
      } catch (error) {
        sendRouteError(error, reply);
      }
    }
  );

  fastify.patch(
    '/internal/channels/:channelId',
    { preHandler: [fastify.requireSession] },
    async (request, reply) => {
      try {
        const params = channelIdParamsSchema.parse(request.params);
        const body = updateChannelSchema.parse(request.body);
        const channel = await channelsService.updateChannel(
          request.currentUser!.id,
          params.channelId,
          body
        );

        reply.send({ channel: toChannelResponse(channel) });
      } catch (error) {
        sendRouteError(error, reply);
      }
    }
  );

  fastify.delete(
    '/internal/channels/:channelId',
    { preHandler: [fastify.requireSession] },
    async (request, reply) => {
      try {
        const params = channelIdParamsSchema.parse(request.params);
        await channelsService.disableChannel(request.currentUser!.id, params.channelId);

        reply.status(204).send();
      } catch (error) {
        sendRouteError(error, reply);
      }
    }
  );

  fastify.post(
    '/internal/channels/:channelId/models',
    { preHandler: [fastify.requireSession] },
    async (request, reply) => {
      try {
        const params = channelIdParamsSchema.parse(request.params);
        const body = createChannelModelSchema.parse(request.body);
        const model = await channelsService.createChannelModel(
          request.currentUser!.id,
          params.channelId,
          body
        );

        reply.status(201).send({ model });
      } catch (error) {
        sendRouteError(error, reply);
      }
    }
  );

  fastify.patch(
    '/internal/channels/:channelId/models/:modelId',
    { preHandler: [fastify.requireSession] },
    async (request, reply) => {
      try {
        const params = channelModelIdParamsSchema.parse(request.params);
        const body = updateChannelModelSchema.parse(request.body);
        const model = await channelsService.updateChannelModel(
          request.currentUser!.id,
          params.channelId,
          params.modelId,
          body
        );

        reply.send({ model });
      } catch (error) {
        sendRouteError(error, reply);
      }
    }
  );

  fastify.delete(
    '/internal/channels/:channelId/models/:modelId',
    { preHandler: [fastify.requireSession] },
    async (request, reply) => {
      try {
        const params = channelModelIdParamsSchema.parse(request.params);
        await channelsService.disableChannelModel(
          request.currentUser!.id,
          params.channelId,
          params.modelId
        );

        reply.status(204).send();
      } catch (error) {
        sendRouteError(error, reply);
      }
    }
  );

  fastify.post(
    '/internal/channels/:channelId/test',
    { preHandler: [fastify.requireSession] },
    async (request, reply) => {
      try {
        const params = channelIdParamsSchema.parse(request.params);
        const result = await channelsService.testChannel(request.currentUser!.id, params.channelId);

        reply.send(result);
      } catch (error) {
        sendRouteError(error, reply);
      }
    }
  );

  fastify.post(
    '/internal/logical-models',
    { preHandler: [fastify.requireSession] },
    async (request, reply) => {
      try {
        const body = createLogicalModelSchema.parse(request.body);
        const result = await channelsService.createLogicalModel(request.currentUser!.id, body);

        reply.status(201).send({
          logicalModel: toLogicalModelResponse(result.logicalModel),
          routes: result.routes
        });
      } catch (error) {
        sendRouteError(error, reply);
      }
    }
  );

  fastify.get(
    '/internal/logical-models',
    { preHandler: [fastify.requireSession] },
    async (request, reply) => {
      try {
        const logicalModels = await channelsService.listLogicalModels(request.currentUser!.id);
        reply.send({
          logicalModels: logicalModels.map((logicalModel) => toLogicalModelResponse(logicalModel))
        });
      } catch (error) {
        sendRouteError(error, reply);
      }
    }
  );

  fastify.patch(
    '/internal/logical-models/:logicalModelId',
    { preHandler: [fastify.requireSession] },
    async (request, reply) => {
      try {
        const params = logicalModelIdParamsSchema.parse(request.params);
        const body = updateLogicalModelSchema.parse(request.body);
        const result = await channelsService.updateLogicalModel(
          request.currentUser!.id,
          params.logicalModelId,
          body
        );

        reply.send({
          logicalModel: toLogicalModelResponse(result.logicalModel),
          routes: result.routes
        });
      } catch (error) {
        sendRouteError(error, reply);
      }
    }
  );

  fastify.delete(
    '/internal/logical-models/:logicalModelId',
    { preHandler: [fastify.requireSession] },
    async (request, reply) => {
      try {
        const params = logicalModelIdParamsSchema.parse(request.params);
        await channelsService.disableLogicalModel(request.currentUser!.id, params.logicalModelId);

        reply.status(204).send();
      } catch (error) {
        sendRouteError(error, reply);
      }
    }
  );
}
