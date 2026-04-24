import { z } from 'zod';

export const responseToolSchema = z
  .object({
    type: z.string()
  })
  .passthrough();

export const responseInputSchema = z.union([z.string(), z.array(z.any())]);

export const responseRequestSchema = z
  .object({
    model: z.string().optional(),
    input: responseInputSchema.optional(),
    stream: z.boolean().optional(),
    tools: z.array(responseToolSchema).optional()
  })
  .passthrough();

export const responseStreamEventSchema = z
  .object({
    type: z.string()
  })
  .passthrough();

export type ResponseRequest = z.infer<typeof responseRequestSchema>;
export type ResponseStreamEvent = z.infer<typeof responseStreamEventSchema>;
