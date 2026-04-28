export const channelProviderIds = [
  'openai-compatible',
  'openai',
  'anthropic',
  'deepseek'
] as const;

export type ChannelProvider = (typeof channelProviderIds)[number];
export type ChannelProtocol = 'openai-compatible' | 'anthropic-messages';

export type ChannelProviderConfig = {
  id: ChannelProvider;
  label: string;
  protocol: ChannelProtocol;
  requiresBaseUrl: boolean;
  baseUrl?: string;
  defaultModelId?: string;
  defaultChannelModels: Array<{
    upstreamModelId: string;
    inputPricePer1m: string;
    outputPricePer1m: string;
    currency: string;
  }>;
};

export const channelProviderConfigs = {
  'openai-compatible': {
    id: 'openai-compatible',
    label: 'OpenAI Compatible',
    protocol: 'openai-compatible',
    requiresBaseUrl: true,
    defaultChannelModels: []
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    protocol: 'openai-compatible',
    requiresBaseUrl: false,
    baseUrl: 'https://api.openai.com/v1',
    defaultModelId: 'gpt-5.5',
    defaultChannelModels: [
      {
        upstreamModelId: 'gpt-5.5',
        inputPricePer1m: '0.0000',
        outputPricePer1m: '0.0000',
        currency: 'USD'
      }
    ]
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    protocol: 'anthropic-messages',
    requiresBaseUrl: false,
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModelId: 'claude-sonnet-4-5-20250929',
    defaultChannelModels: [
      {
        upstreamModelId: 'claude-sonnet-4-5-20250929',
        inputPricePer1m: '0.0000',
        outputPricePer1m: '0.0000',
        currency: 'USD'
      }
    ]
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    protocol: 'openai-compatible',
    requiresBaseUrl: false,
    baseUrl: 'https://api.deepseek.com',
    defaultModelId: 'deepseek-chat',
    defaultChannelModels: [
      {
        upstreamModelId: 'deepseek-chat',
        inputPricePer1m: '0.0000',
        outputPricePer1m: '0.0000',
        currency: 'USD'
      }
    ]
  }
} satisfies Record<ChannelProvider, ChannelProviderConfig>;

export function getChannelProviderConfig(provider: ChannelProvider) {
  return channelProviderConfigs[provider];
}

export function isPresetChannelProvider(provider: ChannelProvider) {
  return provider !== 'openai-compatible';
}
