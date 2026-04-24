import { describe, expect, it } from 'vitest';
import { createMockUpstream } from '../helpers/mock-upstream.js';
import { testOpenAiCompatibleChannel } from '../../src/modules/channels/provider-test.js';
import { decryptChannelSecret, encryptChannelSecret } from '../../src/modules/channels/secret.js';
import {
  assertSafeUpstreamBaseUrl,
  ChannelBaseUrlValidationError,
  parseSupportedUpstreamBaseUrl
} from '../../src/modules/channels/upstream-safety.js';

describe('channel secret encryption', () => {
  it('encrypts api keys at rest and decrypts them for provider use', () => {
    const secret = 'test-channel-key-encryption-secret-32';
    const encrypted = encryptChannelSecret('sk-test', secret);

    expect(encrypted).not.toBe('sk-test');
    expect(decryptChannelSecret(encrypted, secret)).toBe('sk-test');
  });
});

describe('channel upstream safety', () => {
  it('rejects unsupported upstream schemes', () => {
    expect(() => parseSupportedUpstreamBaseUrl('file:///tmp/router.sock')).toThrowError(
      new ChannelBaseUrlValidationError('INVALID_CHANNEL_BASE_URL')
    );
  });

  it('rejects private upstream targets when private base URLs are disabled', async () => {
    await expect(
      assertSafeUpstreamBaseUrl('http://localhost:3000', {
        allowPrivateBaseUrls: false,
        lookupFn: async () => [{ address: '127.0.0.1', family: 4 }]
      })
    ).rejects.toMatchObject({
      code: 'UNSAFE_CHANNEL_BASE_URL'
    });
  });

  it('rejects IPv4-mapped IPv6 private targets when private base URLs are disabled', async () => {
    await expect(
      assertSafeUpstreamBaseUrl('http://mapped-private.example:3000', {
        allowPrivateBaseUrls: false,
        lookupFn: async () => [{ address: '::ffff:7f00:1', family: 6 }]
      })
    ).rejects.toMatchObject({
      code: 'UNSAFE_CHANNEL_BASE_URL'
    });
  });

  it('rejects bracketed IPv6 literals that point at loopback', async () => {
    await expect(
      assertSafeUpstreamBaseUrl('http://[::1]:3000', {
        allowPrivateBaseUrls: false
      })
    ).rejects.toMatchObject({
      code: 'UNSAFE_CHANNEL_BASE_URL'
    });
  });

  it('allows public upstream targets when private base URLs are disabled', async () => {
    await expect(
      assertSafeUpstreamBaseUrl('https://api.example.com', {
        allowPrivateBaseUrls: false,
        lookupFn: async () => [{ address: '93.184.216.34', family: 4 }]
      })
    ).resolves.toMatchObject({
      address: '93.184.216.34',
      url: expect.any(URL)
    });
  });

  it('pins provider requests to the already validated lookup address', async () => {
    const upstream = createMockUpstream();
    await upstream.start();

    try {
      const localPort = new URL(upstream.baseUrl).port;
      const target = await assertSafeUpstreamBaseUrl(`http://rebind.test:${localPort}`, {
        allowPrivateBaseUrls: true,
        lookupFn: async () => [{ address: '127.0.0.1', family: 4 }]
      });

      await expect(
        testOpenAiCompatibleChannel({
          apiKey: 'sk-test',
          model: 'gpt-4o',
          target,
          timeoutMs: 1000
        })
      ).resolves.toEqual({ ok: true });
    } finally {
      await upstream.stop();
    }
  });
});
