import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

type MockResponseOverride = {
  body?: unknown;
  chunkDelayMs?: number;
  chunks?: Array<string | Buffer>;
  delayMs?: number;
  destroyAfterChunks?: boolean;
  headers?: Record<string, string>;
  rawBody?: string;
  statusCode?: number;
};

type MockRequestBody = Record<string, unknown> & {
  model?: unknown;
  input?: unknown;
  messages?: Array<{ content?: unknown }> | unknown;
};

function normalizeBasePath(basePath: string | undefined) {
  if (!basePath || basePath === '/') {
    return '';
  }

  return `/${basePath.replace(/^\/+|\/+$/g, '')}`;
}

export function createMockUpstream(options?: { basePath?: string; bodyLimit?: number }) {
  let app: FastifyInstance | null = null;
  let baseUrl = '';
  let nextRequestHook: (() => Promise<void> | void) | null = null;
  let nextResponseOverride: MockResponseOverride | null = null;
  let failNextRequestBeforeBody = false;
  let requestCount = 0;
  const basePath = normalizeBasePath(options?.basePath);
  const completionsPath = `${basePath}/chat/completions`;
  const embeddingsPath = `${basePath}/embeddings`;
  const responsesPath = `${basePath}/responses`;

  async function handleRequest(request: {
    headers: Record<string, unknown>;
    body: MockRequestBody;
  }) {
    requestCount += 1;
    const hook = nextRequestHook;
    nextRequestHook = null;
    const responseOverride = nextResponseOverride;
    nextResponseOverride = null;
    const shouldFailBeforeBody = failNextRequestBeforeBody;
    failNextRequestBeforeBody = false;

    if (hook) {
      await hook();
    }

    return {
      responseOverride,
      shouldFailBeforeBody,
      authorization: request.headers.authorization,
      body: request.body
    };
  }

  return {
    get baseUrl() {
      if (!baseUrl) {
        throw new Error('Mock upstream not started');
      }

      return baseUrl;
    },
    get requestCount() {
      return requestCount;
    },
    setNextRequestHook(hook: () => Promise<void> | void) {
      nextRequestHook = hook;
    },
    setNextResponseOverride(override: MockResponseOverride) {
      nextResponseOverride = override;
    },
    failBeforeBody() {
      failNextRequestBeforeBody = true;
    },
    async start() {
      if (app) {
        return;
      }

      const server = Fastify({
        logger: false,
        bodyLimit: options?.bodyLimit
      });

      server.post(completionsPath, async (request, reply) => {
        const result = await handleRequest({
          headers: request.headers as Record<string, unknown>,
          body: (request.body ?? {}) as MockRequestBody
        });

        if (result.shouldFailBeforeBody) {
          reply.raw.destroy(new Error('mock upstream failed before body'));
          return reply;
        }

        if (result.responseOverride?.delayMs) {
          const delayMs = result.responseOverride.delayMs;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        if (result.responseOverride) {
          if (result.responseOverride.headers) {
            for (const [name, value] of Object.entries(result.responseOverride.headers)) {
              reply.header(name, value);
            }
          }

          reply.status(result.responseOverride.statusCode ?? 200);

          if (result.responseOverride.rawBody !== undefined) {
            return reply.send(result.responseOverride.rawBody);
          }

          if (result.responseOverride.chunks) {
            reply.hijack();
            reply.raw.statusCode = result.responseOverride.statusCode ?? 200;

            if (result.responseOverride.headers) {
              for (const [name, value] of Object.entries(result.responseOverride.headers)) {
                reply.raw.setHeader(name, value);
              }
            }

            reply.raw.flushHeaders?.();

            for (const chunk of result.responseOverride.chunks) {
              reply.raw.write(chunk);

              if (result.responseOverride.chunkDelayMs) {
                await new Promise((resolve) =>
                  setTimeout(resolve, result.responseOverride?.chunkDelayMs)
                );
              }
            }

            reply.raw.end();
            return reply;
          }

          return reply.send(result.responseOverride.body ?? {});
        }

        if (result.authorization !== 'Bearer sk-test') {
          reply.status(401).send({
            error: {
              message: 'Unauthorized'
            }
          });
          return;
        }

        reply.send({
          id: 'chatcmpl-test',
          object: 'chat.completion',
          created: 1,
          model: typeof result.body.model === 'string' ? result.body.model : 'gpt-4o',
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: getEchoContent(result.body)
              }
            }
          ],
          usage: {
            prompt_tokens: 4,
            completion_tokens: 2,
            total_tokens: 6
          }
        });
      });

      server.post(embeddingsPath, async (request, reply) => {
        const result = await handleRequest({
          headers: request.headers as Record<string, unknown>,
          body: (request.body ?? {}) as MockRequestBody
        });

        if (result.shouldFailBeforeBody) {
          reply.raw.destroy(new Error('mock upstream failed before body'));
          return reply;
        }

        if (result.authorization !== 'Bearer sk-test') {
          reply.status(401).send({
            error: {
              message: 'Unauthorized'
            }
          });
          return;
        }

        reply.send({
          object: 'list',
          model: typeof result.body.model === 'string' ? result.body.model : 'text-embedding-3-small',
          data: [
            {
              object: 'embedding',
              index: 0,
              embedding: [0.1, 0.2, 0.3]
            }
          ],
          usage: {
            prompt_tokens: 3,
            total_tokens: 3
          }
        });
      });

      server.post(responsesPath, async (request, reply) => {
        const result = await handleRequest({
          headers: request.headers as Record<string, unknown>,
          body: (request.body ?? {}) as MockRequestBody
        });

        if (result.shouldFailBeforeBody) {
          reply.raw.destroy(new Error('mock upstream failed before body'));
          return reply;
        }

        if (result.responseOverride?.delayMs) {
          const delayMs = result.responseOverride.delayMs;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        if (result.responseOverride) {
          if (result.responseOverride.headers) {
            for (const [name, value] of Object.entries(result.responseOverride.headers)) {
              reply.header(name, value);
            }
          }

          reply.status(result.responseOverride.statusCode ?? 200);

          if (result.responseOverride.rawBody !== undefined) {
            return reply.send(result.responseOverride.rawBody);
          }

          if (result.responseOverride.chunks) {
            reply.hijack();
            reply.raw.statusCode = result.responseOverride.statusCode ?? 200;

            if (result.responseOverride.headers) {
              for (const [name, value] of Object.entries(result.responseOverride.headers)) {
                reply.raw.setHeader(name, value);
              }
            }

            reply.raw.flushHeaders?.();

            for (const chunk of result.responseOverride.chunks) {
              reply.raw.write(chunk);

              if (result.responseOverride.chunkDelayMs) {
                await new Promise((resolve) =>
                  setTimeout(resolve, result.responseOverride?.chunkDelayMs)
                );
              }
            }

            if (result.responseOverride.destroyAfterChunks) {
              reply.raw.destroy(new Error('mock upstream failed after body'));
              return reply;
            }

            reply.raw.end();
            return reply;
          }

          return reply.send(result.responseOverride.body ?? {});
        }

        if (result.authorization !== 'Bearer sk-test') {
          reply.status(401).send({
            error: {
              message: 'Unauthorized'
            }
          });
          return;
        }

        reply.send({
          id: 'resp_test',
          object: 'response',
          status: 'completed',
          model: typeof result.body.model === 'string' ? result.body.model : 'gpt-4.1',
          output: [
            {
              type: 'message',
              id: 'msg_1',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: getResponseOutputText(result.body)
                }
              ]
            }
          ],
          usage: {
            input_tokens: 4,
            output_tokens: 2,
            total_tokens: 6
          }
        });
      });

      try {
        const address = await server.listen({
          host: '127.0.0.1',
          port: 0
        });

        app = server;
        baseUrl = basePath ? new URL(basePath, address).toString() : address;
      } catch (error) {
        nextRequestHook = null;
        nextResponseOverride = null;
        baseUrl = '';
        app = null;
        await server.close().catch(() => undefined);
        throw error;
      }
    },
    async stop() {
      if (!app) {
        return;
      }

      await app.close();
      app = null;
      baseUrl = '';
      nextRequestHook = null;
      nextResponseOverride = null;
      failNextRequestBeforeBody = false;
      requestCount = 0;
    }
  };
}

function getEchoContent(body: MockRequestBody) {
  if (!Array.isArray(body.messages)) {
    return 'pong';
  }

  const firstMessage = body.messages[0];

  if (!firstMessage || typeof firstMessage !== 'object' || firstMessage === null) {
    return 'pong';
  }

  return typeof firstMessage.content === 'string' ? `echo:${firstMessage.content}` : 'pong';
}

function getResponseOutputText(body: MockRequestBody) {
  if (typeof body.input === 'string') {
    return `echo:${body.input}`;
  }

  return 'pong';
}
