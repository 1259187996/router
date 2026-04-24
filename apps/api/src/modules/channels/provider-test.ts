import http from 'node:http';
import https from 'node:https';
import type { IncomingMessage } from 'node:http';
import { ZodError, z } from 'zod';
import type { VerifiedUpstreamTarget } from './upstream-safety.js';

const maxResponseBytes = 1_000_000;
const chatCompletionResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          role: z.string(),
          content: z.any().optional()
        })
      })
    )
    .min(1)
});

export async function testOpenAiCompatibleChannel(input: {
  apiKey: string;
  model: string;
  target: VerifiedUpstreamTarget;
  timeoutMs?: number;
}) {
  const baseUrl = input.target.url.toString().endsWith('/')
    ? input.target.url.toString()
    : `${input.target.url.toString()}/`;
  const url = new URL('chat/completions', baseUrl);
  const timeoutMs = input.timeoutMs ?? 5000;

  try {
    const response = await postJsonWithPinnedLookup({
      body: {
        model: input.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1
      },
      headers: {
        authorization: `Bearer ${input.apiKey}`
      },
      target: input.target,
      timeoutMs,
      url
    });

    if (response.statusCode >= 300 && response.statusCode < 400) {
      throw new Error('CHANNEL_TEST_FAILED:REDIRECT');
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`CHANNEL_TEST_FAILED:${response.statusCode}`);
    }

    chatCompletionResponseSchema.parse(JSON.parse(response.body));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      throw new Error('CHANNEL_TEST_FAILED:INVALID_RESPONSE');
    }

    if (error instanceof Error && error.message === 'CHANNEL_TEST_RESPONSE_TOO_LARGE') {
      throw new Error('CHANNEL_TEST_FAILED:RESPONSE_TOO_LARGE');
    }

    if (
      error instanceof Error &&
      (error.name === 'AbortError' ||
        error.name === 'TimeoutError' ||
        error.message === 'CHANNEL_TEST_TIMEOUT')
    ) {
      throw new Error('CHANNEL_TEST_FAILED:TIMEOUT');
    }

    if (error instanceof Error && error.message.startsWith('CHANNEL_TEST_FAILED:')) {
      throw error;
    }

    throw new Error('CHANNEL_TEST_FAILED:FETCH_ERROR');
  }

  return { ok: true };
}

function postJsonWithPinnedLookup(input: {
  body: unknown;
  headers: Record<string, string>;
  target: VerifiedUpstreamTarget;
  timeoutMs: number;
  url: URL;
}) {
  const body = JSON.stringify(input.body);
  const requestModule = input.url.protocol === 'https:' ? https : http;

  return new Promise<{ body: string; statusCode: number }>((resolve, reject) => {
    const request = requestModule.request(
      input.url,
      {
        headers: {
          ...input.headers,
          'content-length': Buffer.byteLength(body),
          'content-type': 'application/json',
          host: input.url.host
        },
        lookup: (hostname, options, callback) => {
          if (stripIpv6Brackets(hostname) !== stripIpv6Brackets(input.target.url.hostname)) {
            callback(new Error('PINNED_LOOKUP_HOST_MISMATCH'), [], 4);
            return;
          }

          if (typeof options === 'object' && options.all) {
            callback(null, [{ address: input.target.address, family: input.target.family }], 4);
            return;
          }

          callback(null, input.target.address, input.target.family);
        },
        method: 'POST',
        servername: stripIpv6Brackets(input.target.url.hostname),
        timeout: input.timeoutMs
      },
      (response) => {
        collectResponse(response, maxResponseBytes).then(resolve, reject);
      }
    );

    const deadline = setTimeout(() => {
      request.destroy(new Error('CHANNEL_TEST_TIMEOUT'));
    }, input.timeoutMs);

    request.on('close', () => {
      clearTimeout(deadline);
    });
    request.on('timeout', () => {
      request.destroy(new Error('CHANNEL_TEST_TIMEOUT'));
    });
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

function collectResponse(response: IncomingMessage, maxBytes: number) {
  return new Promise<{ body: string; statusCode: number }>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    response.on('data', (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;

      if (totalBytes > maxBytes) {
        response.destroy(new Error('CHANNEL_TEST_RESPONSE_TOO_LARGE'));
        return;
      }

      chunks.push(buffer);
    });
    response.on('error', reject);
    response.on('end', () => {
      resolve({
        body: Buffer.concat(chunks).toString('utf8'),
        statusCode: response.statusCode ?? 0
      });
    });
  });
}

function stripIpv6Brackets(address: string) {
  return address.startsWith('[') && address.endsWith(']') ? address.slice(1, -1) : address;
}
