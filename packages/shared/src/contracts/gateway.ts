import { z } from 'zod';

export const gatewayRouteSchema = z.object({
  routeId: z.string().uuid(),
  channelId: z.string().uuid(),
  baseUrl: z.string().min(1),
  apiKeyEncrypted: z.string().min(1),
  upstreamModelId: z.string().nullable(),
  inputPricePer1m: z.string(),
  outputPricePer1m: z.string(),
  currency: z.string().min(1),
  priority: z.number().int().nonnegative()
});

export const resolveGatewayRoutesInputSchema = z.object({
  userId: z.string().uuid(),
  alias: z.string().min(1)
});

export type GatewayRoute = z.infer<typeof gatewayRouteSchema>;
export type ResolveGatewayRoutesInput = z.infer<typeof resolveGatewayRoutesInputSchema>;
