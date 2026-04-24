import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createMockUpstream } from '../helpers/mock-upstream.js';
import { seedGatewayToken } from '../helpers/login.js';
import { createTestDb } from '../helpers/test-db.js';

const channelKeyEncryptionSecret = 'test-channel-key-secret';

function buildImageDataUrl(payloadSize: number) {
  return `data:image/png;base64,${'A'.repeat(payloadSize)}`;
}

describe('gateway request body limit', () => {
  const db = createTestDb();
  const upstream = createMockUpstream({
    basePath: '/v1',
    bodyLimit: 4 * 1024 * 1024
  });

  beforeAll(async () => {
    await db.start();
    await upstream.start();
  });

  afterAll(async () => {
    await upstream.stop();
    await db.stop();
  });

  it('accepts large responses requests when the configured body limit is high enough', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret,
      bodyLimit: 4 * 1024 * 1024
    });

    try {
      const token = await seedGatewayToken(db.db, upstream.baseUrl, {
        alias: 'responses-image-alias',
        channelKeyEncryptionSecret
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/responses',
        headers: {
          authorization: `Bearer ${token.rawToken}`
        },
        payload: {
          model: token.alias,
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: 'describe this image'
                },
                {
                  type: 'input_image',
                  image_url: buildImageDataUrl(1_500_000)
                }
              ]
            }
          ]
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        object: 'response'
      });
      expect(upstream.requestCount).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });

  it('returns 413 when the request body exceeds the configured limit', async () => {
    const app = await buildApp({
      logger: false,
      db: db.db,
      channelKeyEncryptionSecret,
      bodyLimit: 1024
    });

    try {
      const token = await seedGatewayToken(db.db, upstream.baseUrl, {
        alias: 'responses-body-limit-alias',
        channelKeyEncryptionSecret
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/responses',
        headers: {
          authorization: `Bearer ${token.rawToken}`
        },
        payload: {
          model: token.alias,
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_image',
                  image_url: buildImageDataUrl(2_000)
                }
              ]
            }
          ]
        }
      });

      expect(response.statusCode).toBe(413);
      expect(response.json()).toEqual({
        error: 'Request body is too large'
      });
    } finally {
      await app.close();
    }
  });
});
