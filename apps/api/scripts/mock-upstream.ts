import Fastify from 'fastify';

const host = process.env.MOCK_UPSTREAM_HOST ?? '127.0.0.1';
const port = Number.parseInt(process.env.MOCK_UPSTREAM_PORT ?? '4010', 10);

function isAuthorized(authorization: unknown) {
  return authorization === 'Bearer sk-test';
}

const app = Fastify({ logger: false });

app.get('/health', async () => ({ status: 'ok' }));

app.post('/v1/chat/completions', async (request, reply) => {
  if (!isAuthorized(request.headers.authorization)) {
    reply.status(401).send({
      error: {
        message: 'Unauthorized',
      },
    });
    return;
  }

  const body = (request.body ?? {}) as {
    model?: string;
    messages?: Array<{ content?: string }>;
  };

  reply.send({
    id: 'chatcmpl_e2e',
    object: 'chat.completion',
    created: 1,
    model: body.model ?? 'gpt-4.1-mini',
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        message: {
          role: 'assistant',
          content: body.messages?.[0]?.content ?? 'pong',
        },
      },
    ],
    usage: {
      prompt_tokens: 4,
      completion_tokens: 2,
      total_tokens: 6,
    },
  });
});

app.post('/v1/responses', async (request, reply) => {
  if (!isAuthorized(request.headers.authorization)) {
    reply.status(401).send({
      error: {
        message: 'Unauthorized',
      },
    });
    return;
  }

  const body = (request.body ?? {}) as {
    model?: string;
    input?: string;
  };

  reply.send({
    id: 'resp_e2e_1',
    object: 'response',
    status: 'completed',
    model: body.model ?? 'gpt-4.1-mini',
    output: [
      {
        type: 'message',
        id: 'msg_e2e_1',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: body.input ?? 'pong',
          },
        ],
      },
    ],
    usage: {
      input_tokens: 4,
      output_tokens: 2,
      total_tokens: 6,
    },
  });
});

await app.listen({ host, port });
