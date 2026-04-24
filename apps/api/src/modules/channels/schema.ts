import { z } from 'zod';
import { parseSupportedUpstreamBaseUrl } from './upstream-safety.js';

const decimalPriceSchema = z.string().regex(/^\d+(\.\d{1,4})?$/).refine((value) => {
  const [integerPart, fractionalPart = ''] = value.split('.');
  const normalizedIntegerPart = integerPart.replace(/^0+(?=\d)/, '');

  return normalizedIntegerPart.length <= 8 && fractionalPart.length <= 4;
});

export const createChannelSchema = z.object({
  name: z.string().trim().min(1),
  baseUrl: z.string().trim().url().refine((value) => {
    try {
      parseSupportedUpstreamBaseUrl(value);
      return true;
    } catch {
      return false;
    }
  }),
  apiKey: z.string().trim().min(1),
  defaultModelId: z.string().trim().min(1)
});

export const channelIdParamsSchema = z.object({
  channelId: z.string().uuid()
});

export const createLogicalModelSchema = z.object({
  alias: z.string().trim().min(1),
  description: z.string().trim().default(''),
  routes: z
    .array(
      z.object({
        channelId: z.string().uuid(),
        upstreamModelId: z.string().trim().min(1),
        inputPricePer1m: decimalPriceSchema,
        outputPricePer1m: decimalPriceSchema,
        currency: z.string().trim().min(1),
        priority: z.number().int().nonnegative()
      })
    )
    .min(1)
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type CreateLogicalModelInput = z.infer<typeof createLogicalModelSchema>;
