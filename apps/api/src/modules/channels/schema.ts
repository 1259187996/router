import { z } from 'zod';
import { channelProviderIds, getChannelProviderConfig, type ChannelProvider } from '@router/shared';
import { parseSupportedUpstreamBaseUrl } from './upstream-safety.js';

const decimalPriceSchema = z.string().regex(/^\d+(\.\d{1,4})?$/).refine((value) => {
  const [integerPart, fractionalPart = ''] = value.split('.');
  const normalizedIntegerPart = integerPart.replace(/^0+(?=\d)/, '');

  return normalizedIntegerPart.length <= 8 && fractionalPart.length <= 4;
});

const resourceStatusSchema = z.enum(['active', 'disabled']);
const channelProviderSchema = z.enum(channelProviderIds);
const baseUrlSchema = z.string().trim().url().refine((value) => {
  try {
    parseSupportedUpstreamBaseUrl(value);
    return true;
  } catch {
    return false;
  }
});

export const channelModelSchema = z.object({
  upstreamModelId: z.string().trim().min(1),
  inputPricePer1m: decimalPriceSchema,
  cachedInputPricePer1m: decimalPriceSchema.default('0.0000'),
  outputPricePer1m: decimalPriceSchema,
  currency: z.string().trim().min(1)
});

export const createChannelSchema = z
  .object({
    name: z.string().trim().min(1),
    provider: channelProviderSchema.default('openai-compatible'),
    baseUrl: baseUrlSchema.optional(),
    apiKey: z.string().trim().min(1),
    defaultModelId: z.string().trim().min(1).optional(),
    models: z.array(channelModelSchema).optional()
  })
  .superRefine((input, ctx) => {
    const providerConfig = getChannelProviderConfig(input.provider);

    if (providerConfig.requiresBaseUrl && !input.baseUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['baseUrl'],
        message: 'Base URL is required for this provider'
      });
    }

    if (providerConfig.requiresBaseUrl && !input.defaultModelId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['defaultModelId'],
        message: 'Default model is required for this provider'
      });
    }
  });

export const channelIdParamsSchema = z.object({
  channelId: z.string().uuid()
});

export const updateChannelSchema = z.object({
  name: z.string().trim().min(1).optional(),
  provider: channelProviderSchema.optional(),
  baseUrl: baseUrlSchema.optional(),
  apiKey: z.string().trim().min(1).optional(),
  defaultModelId: z.string().trim().min(1).optional(),
  status: resourceStatusSchema.optional()
});

export const channelModelIdParamsSchema = z.object({
  channelId: z.string().uuid(),
  modelId: z.string().uuid()
});

export const createChannelModelSchema = channelModelSchema;

export const updateChannelModelSchema = channelModelSchema.partial().extend({
  status: resourceStatusSchema.optional()
});

const logicalModelRouteSchema = z
  .object({
    channelId: z.string().uuid(),
    channelModelId: z.string().uuid().optional(),
    upstreamModelId: z.string().trim().min(1).optional(),
    inputPricePer1m: decimalPriceSchema.optional(),
    cachedInputPricePer1m: decimalPriceSchema.default('0.0000'),
    outputPricePer1m: decimalPriceSchema.optional(),
    currency: z.string().trim().min(1).optional(),
    priority: z.number().int().nonnegative()
  })
  .refine(
    (route) =>
      Boolean(route.channelModelId) ||
      Boolean(
        route.upstreamModelId &&
          route.inputPricePer1m &&
          route.outputPricePer1m &&
          route.currency
      ),
    {
      message:
        'Either channelModelId or upstreamModelId with price fields must be provided'
    }
  );

export const createLogicalModelSchema = z.object({
  alias: z.string().trim().min(1),
  description: z.string().trim().default(''),
  routes: z.array(logicalModelRouteSchema).min(1)
});

export const logicalModelIdParamsSchema = z.object({
  logicalModelId: z.string().uuid()
});

export const updateLogicalModelSchema = z.object({
  alias: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  status: resourceStatusSchema.optional(),
  routes: z.array(logicalModelRouteSchema).min(1).optional()
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
export type ChannelModelInput = z.infer<typeof channelModelSchema>;
export type UpdateChannelModelInput = z.infer<typeof updateChannelModelSchema>;
export type CreateLogicalModelInput = z.infer<typeof createLogicalModelSchema>;
export type UpdateLogicalModelInput = z.infer<typeof updateLogicalModelSchema>;
export type LogicalModelRouteInput = z.infer<typeof logicalModelRouteSchema>;
export type CreateChannelPreparedInput = Omit<CreateChannelInput, 'provider' | 'baseUrl' | 'defaultModelId'> & {
  provider: ChannelProvider;
  baseUrl: string;
  defaultModelId: string;
  models?: ChannelModelInput[];
};
export type UpdateChannelPreparedInput = Omit<UpdateChannelInput, 'provider'> & {
  provider?: ChannelProvider;
};
export type PreparedLogicalModelRouteInput = {
  channelId: string;
  channelModelId?: string | null;
  upstreamModelId: string;
  inputPricePer1m: string;
  cachedInputPricePer1m: string;
  outputPricePer1m: string;
  currency: string;
  priority: number;
};
