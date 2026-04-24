import { z } from 'zod';

export const embeddingsInputSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.array(z.number()),
  z.array(z.array(z.number()))
]);

export const embeddingsRequestSchema = z
  .object({
    model: z.string(),
    input: embeddingsInputSchema
  })
  .passthrough();

export type EmbeddingsRequest = z.infer<typeof embeddingsRequestSchema>;
