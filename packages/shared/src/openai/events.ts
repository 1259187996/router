import { z } from 'zod';

export const normalizedEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('response.started'),
    responseId: z.string()
  }),
  z.object({
    type: z.literal('text.delta'),
    delta: z.string()
  }),
  z.object({
    type: z.literal('tool_call.started'),
    toolCallId: z.string(),
    name: z.string()
  }),
  z.object({
    type: z.literal('tool_call.delta'),
    toolCallId: z.string(),
    delta: z.string()
  }),
  z.object({
    type: z.literal('tool_call.completed'),
    toolCallId: z.string(),
    arguments: z.string()
  }),
  z.object({
    type: z.literal('response.completed'),
    usage: z.any().optional()
  }),
  z.object({
    type: z.literal('response.error'),
    message: z.string()
  })
]);

export type NormalizedEvent = z.infer<typeof normalizedEventSchema>;
