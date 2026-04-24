import type { CreateChannelInput, CreateLogicalModelInput } from './schema.js';
import { testOpenAiCompatibleChannel } from './provider-test.js';
import { ChannelsRepository } from './repository.js';
import { decryptChannelSecret, encryptChannelSecret } from './secret.js';
import {
  assertSafeUpstreamBaseUrl,
  ChannelBaseUrlValidationError,
  ChannelUpstreamResolutionError,
  parseSupportedUpstreamBaseUrl,
  type UpstreamLookupResult
} from './upstream-safety.js';

export type ChannelsServiceErrorCode =
  | 'CHANNEL_NOT_FOUND'
  | 'INVALID_ROUTE_CHANNEL'
  | 'LOGICAL_MODEL_ALIAS_EXISTS'
  | 'CHANNEL_TEST_FAILED'
  | 'INVALID_CHANNEL_BASE_URL'
  | 'UNSAFE_CHANNEL_BASE_URL';

export class ChannelsServiceError extends Error {
  constructor(readonly code: ChannelsServiceErrorCode) {
    super(code);
  }
}

type ChannelsServiceOptions = {
  allowPrivateUpstreamBaseUrls: boolean;
  channelKeyEncryptionSecret: string;
  channelTestLookup?: (hostname: string) => Promise<UpstreamLookupResult[]>;
  channelTestTimeoutMs: number;
};

export class ChannelsService {
  constructor(
    private readonly repository: ChannelsRepository,
    private readonly options: ChannelsServiceOptions
  ) {}

  async createChannel(userId: string, input: CreateChannelInput) {
    try {
      parseSupportedUpstreamBaseUrl(input.baseUrl);
    } catch (error) {
      if (error instanceof ChannelBaseUrlValidationError) {
        throw new ChannelsServiceError(error.code);
      }

      throw error;
    }

    return this.repository.createChannel(userId, {
      ...input,
      apiKey: encryptChannelSecret(input.apiKey, this.options.channelKeyEncryptionSecret)
    });
  }

  async testChannel(userId: string, channelId: string) {
    const channel = await this.repository.findChannelByIdAndUserId(channelId, userId);

    if (!channel) {
      throw new ChannelsServiceError('CHANNEL_NOT_FOUND');
    }

    const lastTestedAt = new Date();
    const deadlineAt = Date.now() + this.options.channelTestTimeoutMs;
    const remainingTimeoutMs = () => Math.max(1, deadlineAt - Date.now());
    const persistTestResult = async (lastTestStatus: string, lastTestError: string | null) => {
      const updatedChannel = await this.repository.updateChannelTestResult(channel.id, userId, {
        lastTestStatus,
        lastTestError,
        lastTestedAt
      });

      if (!updatedChannel) {
        throw new ChannelsServiceError('CHANNEL_NOT_FOUND');
      }
    };

    let providerResult: Awaited<ReturnType<typeof testOpenAiCompatibleChannel>>;

    try {
      const target = await assertSafeUpstreamBaseUrl(channel.baseUrl, {
        allowPrivateBaseUrls: this.options.allowPrivateUpstreamBaseUrls,
        lookupFn: this.options.channelTestLookup,
        lookupTimeoutMs: remainingTimeoutMs()
      });
      const apiKey = decryptChannelSecret(
        channel.apiKeyEncrypted,
        this.options.channelKeyEncryptionSecret
      );

      providerResult = await testOpenAiCompatibleChannel({
        apiKey,
        model: channel.defaultModelId,
        target,
        timeoutMs: remainingTimeoutMs()
      });
    } catch (error) {
      if (error instanceof ChannelBaseUrlValidationError) {
        if (error.code === 'UNSAFE_CHANNEL_BASE_URL') {
          throw new ChannelsServiceError(error.code);
        }

        await persistTestResult('failed', 'CHANNEL_TEST_FAILED:INVALID_BASE_URL');
        throw new ChannelsServiceError('CHANNEL_TEST_FAILED');
      }

      if (error instanceof ChannelUpstreamResolutionError) {
        await persistTestResult(
          'failed',
          error.code === 'TIMEOUT' ? 'CHANNEL_TEST_FAILED:TIMEOUT' : 'CHANNEL_TEST_FAILED:DNS_LOOKUP'
        );
        throw new ChannelsServiceError('CHANNEL_TEST_FAILED');
      }

      await persistTestResult(
        'failed',
        error instanceof Error && error.message.startsWith('CHANNEL_TEST_FAILED:')
          ? error.message
          : 'CHANNEL_TEST_FAILED:SECRET_DECRYPT'
      );

      throw new ChannelsServiceError('CHANNEL_TEST_FAILED');
    }

    await persistTestResult('ok', null);

    return providerResult;
  }

  async createLogicalModel(userId: string, input: CreateLogicalModelInput) {
    const channelIds = [...new Set(input.routes.map((route) => route.channelId))];
    const ownedChannelIds = await this.repository.findOwnedChannelIds(userId, channelIds);

    if (ownedChannelIds.length !== channelIds.length) {
      throw new ChannelsServiceError('INVALID_ROUTE_CHANNEL');
    }

    const existingLogicalModel = await this.repository.findActiveLogicalModelByAlias(userId, input.alias);

    if (existingLogicalModel) {
      throw new ChannelsServiceError('LOGICAL_MODEL_ALIAS_EXISTS');
    }

    try {
      return await this.repository.createLogicalModelWithRoutes(userId, input);
    } catch (error) {
      if (this.repository.isActiveLogicalModelAliasConflict(error)) {
        throw new ChannelsServiceError('LOGICAL_MODEL_ALIAS_EXISTS');
      }

      throw error;
    }
  }

  async listChannels(userId: string) {
    return this.repository.listChannelsByUserId(userId);
  }

  async listLogicalModels(userId: string) {
    const rows = await this.repository.listLogicalModelsByUserId(userId);
    const logicalModels = new Map<
      string,
      {
        id: string;
        alias: string;
        description: string;
        status: 'active' | 'disabled';
        createdAt: Date;
        updatedAt: Date;
        routes: Array<{
          id: string;
          channelId: string;
          upstreamModelId: string | null;
          inputPricePer1m: string;
          outputPricePer1m: string;
          currency: string;
          priority: number;
          status: 'active' | 'disabled';
          channelName: string;
        }>;
      }
    >();

    for (const row of rows) {
      if (!logicalModels.has(row.logicalModelId)) {
        logicalModels.set(row.logicalModelId, {
          id: row.logicalModelId,
          alias: row.logicalModelAlias,
          description: row.logicalModelDescription,
          status: row.logicalModelStatus,
          createdAt: row.logicalModelCreatedAt,
          updatedAt: row.logicalModelUpdatedAt,
          routes: []
        });
      }

      if (row.routeId && row.routeChannelName) {
        logicalModels.get(row.logicalModelId)!.routes.push({
          id: row.routeId,
          channelId: row.routeChannelId!,
          upstreamModelId: row.routeUpstreamModelId,
          inputPricePer1m: row.routeInputPricePer1m!,
          outputPricePer1m: row.routeOutputPricePer1m!,
          currency: row.routeCurrency!,
          priority: row.routePriority!,
          status: row.routeStatus!,
          channelName: row.routeChannelName
        });
      }
    }

    return [...logicalModels.values()];
  }
}
