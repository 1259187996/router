import type {
  ChannelModelInput,
  CreateChannelPreparedInput,
  CreateChannelInput,
  CreateLogicalModelInput,
  LogicalModelRouteInput,
  PreparedLogicalModelRouteInput,
  UpdateChannelInput,
  UpdateChannelModelInput,
  UpdateLogicalModelInput
} from './schema.js';
import {
  channelProviderIds,
  getChannelProviderConfig,
  type ChannelProvider,
  type ChannelProviderConfig
} from '@router/shared';
import { testAnthropicMessagesChannel, testOpenAiCompatibleChannel } from './provider-test.js';
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
  | 'CHANNEL_MODEL_NOT_FOUND'
  | 'INVALID_ROUTE_CHANNEL'
  | 'LOGICAL_MODEL_ALIAS_EXISTS'
  | 'LOGICAL_MODEL_NOT_FOUND'
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
    const normalizedInput = this.normalizeCreateChannelInput(input);

    try {
      parseSupportedUpstreamBaseUrl(normalizedInput.baseUrl);
    } catch (error) {
      if (error instanceof ChannelBaseUrlValidationError) {
        throw new ChannelsServiceError(error.code);
      }

      throw error;
    }

    return this.repository.createChannel(userId, {
      ...normalizedInput,
      apiKey: encryptChannelSecret(
        normalizedInput.apiKey,
        this.options.channelKeyEncryptionSecret
      )
    });
  }

  async updateChannel(userId: string, channelId: string, input: UpdateChannelInput) {
    let normalizedInput = input;

    if (input.provider !== undefined) {
      const existingChannel = await this.repository.findChannelByIdAndUserId(channelId, userId);

      if (!existingChannel) {
        throw new ChannelsServiceError('CHANNEL_NOT_FOUND');
      }

      normalizedInput = {
        ...input,
        ...this.getPresetChannelDefaults(input.provider, {
          baseUrl: input.baseUrl,
          defaultModelId: input.defaultModelId
        })
      };
    }

    if (normalizedInput.baseUrl !== undefined) {
      try {
        parseSupportedUpstreamBaseUrl(normalizedInput.baseUrl);
      } catch (error) {
        if (error instanceof ChannelBaseUrlValidationError) {
          throw new ChannelsServiceError(error.code);
        }

        throw error;
      }
    }

    const channel = await this.repository.updateChannelByIdAndUserId(channelId, userId, {
      ...normalizedInput,
      ...(normalizedInput.apiKey
        ? {
            apiKeyEncrypted: encryptChannelSecret(
              normalizedInput.apiKey,
              this.options.channelKeyEncryptionSecret
            )
          }
        : {})
    });

    if (!channel) {
      throw new ChannelsServiceError('CHANNEL_NOT_FOUND');
    }

    return channel;
  }

  async disableChannel(userId: string, channelId: string) {
    const channel = await this.repository.disableChannelByIdAndUserId(channelId, userId);

    if (!channel) {
      throw new ChannelsServiceError('CHANNEL_NOT_FOUND');
    }
  }

  async getChannelDetail(userId: string, channelId: string) {
    const channel = await this.repository.findChannelByIdAndUserId(channelId, userId);

    if (!channel) {
      throw new ChannelsServiceError('CHANNEL_NOT_FOUND');
    }

    return {
      channel,
      models: await this.repository.listChannelModelsByChannelIdAndUserId(userId, channelId),
      logicalModels: await this.listLogicalModels(userId, channelId)
    };
  }

  async createChannelModel(userId: string, channelId: string, input: ChannelModelInput) {
    const channel = await this.repository.findChannelByIdAndUserId(channelId, userId);

    if (!channel) {
      throw new ChannelsServiceError('CHANNEL_NOT_FOUND');
    }

    return this.repository.createChannelModel(userId, channelId, input);
  }

  async updateChannelModel(
    userId: string,
    channelId: string,
    modelId: string,
    input: UpdateChannelModelInput
  ) {
    const model = await this.repository.updateChannelModelByIdAndUserId(
      userId,
      channelId,
      modelId,
      input
    );

    if (!model) {
      throw new ChannelsServiceError('CHANNEL_MODEL_NOT_FOUND');
    }

    return model;
  }

  async disableChannelModel(userId: string, channelId: string, modelId: string) {
    const model = await this.repository.disableChannelModelByIdAndUserId(
      userId,
      channelId,
      modelId
    );

    if (!model) {
      throw new ChannelsServiceError('CHANNEL_MODEL_NOT_FOUND');
    }
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

    let providerResult: { ok: boolean };

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

      const testInput = {
        apiKey,
        model: channel.defaultModelId,
        target,
        timeoutMs: remainingTimeoutMs()
      };
      const providerConfig = getChannelProviderConfig(this.normalizeProvider(channel.provider));

      providerResult =
        providerConfig.protocol === 'anthropic-messages'
          ? await testAnthropicMessagesChannel(testInput)
          : await testOpenAiCompatibleChannel(testInput);
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
    const existingLogicalModel = await this.repository.findActiveLogicalModelByAlias(userId, input.alias);

    if (existingLogicalModel) {
      throw new ChannelsServiceError('LOGICAL_MODEL_ALIAS_EXISTS');
    }

    const routes = await this.prepareLogicalModelRoutes(userId, input.routes);

    try {
      return await this.repository.createLogicalModelWithRoutes(userId, {
        ...input,
        routes
      });
    } catch (error) {
      if (this.repository.isActiveLogicalModelAliasConflict(error)) {
        throw new ChannelsServiceError('LOGICAL_MODEL_ALIAS_EXISTS');
      }

      throw error;
    }
  }

  async updateLogicalModel(userId: string, logicalModelId: string, input: UpdateLogicalModelInput) {
    const logicalModel = await this.repository.findLogicalModelByIdAndUserId(userId, logicalModelId);

    if (!logicalModel) {
      throw new ChannelsServiceError('LOGICAL_MODEL_NOT_FOUND');
    }

    if (input.alias && input.alias !== logicalModel.alias) {
      const existingLogicalModel = await this.repository.findActiveLogicalModelByAlias(
        userId,
        input.alias
      );

      if (existingLogicalModel && existingLogicalModel.id !== logicalModelId) {
        throw new ChannelsServiceError('LOGICAL_MODEL_ALIAS_EXISTS');
      }
    }

    const routes = input.routes
      ? await this.prepareLogicalModelRoutes(userId, input.routes)
      : undefined;

    try {
      const result = await this.repository.updateLogicalModelWithRoutes(userId, logicalModelId, {
        ...input,
        routes
      });

      if (!result) {
        throw new ChannelsServiceError('LOGICAL_MODEL_NOT_FOUND');
      }

      return result;
    } catch (error) {
      if (this.repository.isActiveLogicalModelAliasConflict(error)) {
        throw new ChannelsServiceError('LOGICAL_MODEL_ALIAS_EXISTS');
      }

      throw error;
    }
  }

  async disableLogicalModel(userId: string, logicalModelId: string) {
    const logicalModel = await this.repository.disableLogicalModelByIdAndUserId(
      userId,
      logicalModelId
    );

    if (!logicalModel) {
      throw new ChannelsServiceError('LOGICAL_MODEL_NOT_FOUND');
    }
  }

  async listChannels(userId: string) {
    return this.repository.listChannelsByUserId(userId);
  }

  async listLogicalModels(userId: string, channelId?: string) {
    const rows = channelId
      ? await this.repository.listLogicalModelsByChannelIdAndUserId(userId, channelId)
      : await this.repository.listLogicalModelsByUserId(userId);
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
          ...(row.routeChannelModelId ? { channelModelId: row.routeChannelModelId } : {}),
          upstreamModelId: row.routeUpstreamModelId,
          inputPricePer1m: row.routeInputPricePer1m!,
          cachedInputPricePer1m: row.routeCachedInputPricePer1m!,
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

  private async prepareLogicalModelRoutes(
    userId: string,
    routes: LogicalModelRouteInput[]
  ): Promise<PreparedLogicalModelRouteInput[]> {
    const channelIds = [...new Set(routes.map((route) => route.channelId))];
    const ownedChannelIds = await this.repository.findOwnedChannelIds(userId, channelIds);

    if (ownedChannelIds.length !== channelIds.length) {
      throw new ChannelsServiceError('INVALID_ROUTE_CHANNEL');
    }

    const preparedRoutes: PreparedLogicalModelRouteInput[] = [];

    for (const route of routes) {
      if (route.channelModelId) {
        const channelModel = await this.repository.findActiveChannelModelByIdAndUserId(
          userId,
          route.channelId,
          route.channelModelId
        );

        if (!channelModel) {
          throw new ChannelsServiceError('INVALID_ROUTE_CHANNEL');
        }

        preparedRoutes.push({
          channelId: route.channelId,
          channelModelId: channelModel.id,
          upstreamModelId: channelModel.upstreamModelId,
          inputPricePer1m: channelModel.inputPricePer1m,
          cachedInputPricePer1m: channelModel.cachedInputPricePer1m,
          outputPricePer1m: channelModel.outputPricePer1m,
          currency: channelModel.currency,
          priority: route.priority
        });
        continue;
      }

      preparedRoutes.push({
        channelId: route.channelId,
        channelModelId: null,
        upstreamModelId: route.upstreamModelId!,
        inputPricePer1m: route.inputPricePer1m!,
        cachedInputPricePer1m: route.cachedInputPricePer1m,
        outputPricePer1m: route.outputPricePer1m!,
        currency: route.currency!,
        priority: route.priority
      });
    }

    return preparedRoutes;
  }

  private normalizeCreateChannelInput(input: CreateChannelInput): CreateChannelPreparedInput {
    const provider = input.provider;
    const presetDefaults = this.getPresetChannelDefaults(provider, {
      baseUrl: input.baseUrl,
      defaultModelId: input.defaultModelId
    });
    const baseUrl = presetDefaults.baseUrl ?? input.baseUrl;
    const defaultModelId = presetDefaults.defaultModelId ?? input.defaultModelId;

    if (!baseUrl || !defaultModelId) {
      throw new ChannelsServiceError('INVALID_CHANNEL_BASE_URL');
    }

    return {
      ...input,
      provider,
      baseUrl,
      defaultModelId,
      models:
        input.models && input.models.length > 0
          ? input.models.map((model) => ({
              ...model,
              cachedInputPricePer1m: model.cachedInputPricePer1m ?? '0.0000'
            }))
          : this.getDefaultChannelModels(provider)
    };
  }

  private getPresetChannelDefaults(
    provider: ChannelProvider,
    input: { baseUrl?: string; defaultModelId?: string }
  ) {
    const providerConfig = getChannelProviderConfig(provider);

    if (providerConfig.requiresBaseUrl) {
      return input;
    }

    return {
      baseUrl: input.baseUrl ?? this.requirePresetValue(providerConfig, 'baseUrl'),
      defaultModelId:
        input.defaultModelId ?? this.requirePresetValue(providerConfig, 'defaultModelId')
    };
  }

  private getDefaultChannelModels(provider: ChannelProvider) {
    const providerConfig = getChannelProviderConfig(provider);

    return providerConfig.defaultChannelModels.map((model) => ({ ...model }));
  }

  private requirePresetValue(
    providerConfig: ChannelProviderConfig,
    key: 'baseUrl' | 'defaultModelId'
  ) {
    const value = providerConfig[key];

    if (!value) {
      throw new ChannelsServiceError('INVALID_CHANNEL_BASE_URL');
    }

    return value;
  }

  private normalizeProvider(provider: string): ChannelProvider {
    if ((channelProviderIds as readonly string[]).includes(provider)) {
      return provider as ChannelProvider;
    }

    return 'openai-compatible';
  }
}
