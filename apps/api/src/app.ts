import cookie from '@fastify/cookie';
import Fastify, { type FastifyServerOptions } from 'fastify';
import type { AppDb } from './modules/auth/repository.js';
import type { UpstreamLookupResult } from './modules/channels/upstream-safety.js';
import { AuthRepository } from './modules/auth/repository.js';
import { AuthService } from './modules/auth/service.js';
import { registerAuthRoutes } from './modules/auth/routes.js';
import { ChannelsRepository } from './modules/channels/repository.js';
import { ChannelsService } from './modules/channels/service.js';
import { registerChannelRoutes } from './modules/channels/routes.js';
import { TokensRepository } from './modules/tokens/repository.js';
import { TokenService } from './modules/tokens/service.js';
import { registerTokenRoutes } from './modules/tokens/routes.js';
import { LogsRepository } from './modules/logs/repository.js';
import { LogsService } from './modules/logs/service.js';
import { registerLogRoutes } from './modules/logs/routes.js';
import { registerSessionPlugin } from './plugins/session.js';
import { registerErrorHandler } from './plugins/errors.js';
import { registerGatewayAuthPlugin } from './plugins/gateway-auth.js';
import { registerOpenAiRoutes } from './modules/gateway/openai-routes.js';

type BuildAppOptions = Pick<FastifyServerOptions, 'logger'> & {
  allowPrivateUpstreamBaseUrls?: boolean;
  channelKeyEncryptionSecret?: string;
  channelTestLookup?: (hostname: string) => Promise<UpstreamLookupResult[]>;
  channelTestTimeoutMs?: number;
  gatewayUpstreamTimeoutMs?: number;
  db?: AppDb;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? true });
  const appDb = options.db ?? (await loadProductionDb());

  app.decorate('db', appDb);
  registerErrorHandler(app);
  await app.register(cookie);

  const authRepository = new AuthRepository(appDb);
  const authService = new AuthService(authRepository);
  const channelsRepository = new ChannelsRepository(appDb);
  const channelRuntimeOptions = await loadChannelRuntimeOptions(options);
  const channelsService = new ChannelsService(channelsRepository, channelRuntimeOptions);
  const tokensRepository = new TokensRepository(appDb);
  const tokenService = new TokenService(tokensRepository);
  const logsRepository = new LogsRepository(appDb);
  const logsService = new LogsService(logsRepository);
  await registerSessionPlugin(app, authService);
  await registerGatewayAuthPlugin(app, tokenService);
  await registerAuthRoutes(app);
  await registerChannelRoutes(app, channelsService);
  await registerTokenRoutes(app, tokenService);
  await registerLogRoutes(app, logsService);
  await registerOpenAiRoutes(app, {
    channelKeyEncryptionSecret: channelRuntimeOptions.channelKeyEncryptionSecret,
    upstreamTimeoutMs: options.gatewayUpstreamTimeoutMs ?? 30_000
  });

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}

async function loadProductionDb() {
  const { db } = await import('./db/client.js');
  return db;
}

async function loadChannelRuntimeOptions(options: BuildAppOptions) {
  const { env } = await import('./env.js');

  return {
    allowPrivateUpstreamBaseUrls:
      options.allowPrivateUpstreamBaseUrls ?? env.ALLOW_PRIVATE_UPSTREAM_BASE_URLS,
    channelKeyEncryptionSecret:
      options.channelKeyEncryptionSecret ?? env.CHANNEL_KEY_ENCRYPTION_SECRET,
    channelTestLookup: options.channelTestLookup,
    channelTestTimeoutMs: options.channelTestTimeoutMs ?? env.CHANNEL_TEST_TIMEOUT_MS
  };
}
