import { z } from 'zod';

export const chatMessageSchema = z
  .object({
    role: z.string(),
    content: z.any()
  })
  .passthrough();

export const chatRequestSchema = z
  .object({
    model: z.string(),
    messages: z.array(chatMessageSchema),
    stream: z.boolean().optional()
  })
  .passthrough();

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
