import { z } from 'zod';

const usdAmountSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/)
  .refine((value) => {
    const [integerPart, fractionalPart = ''] = value.split('.');
    const normalizedIntegerPart = integerPart.replace(/^0+(?=\d)/, '');

    return normalizedIntegerPart.length <= 10 && fractionalPart.length <= 2;
  });

export const createTokenSchema = z.object({
  name: z.string().trim().min(1),
  logicalModelId: z.string().uuid(),
  budgetLimitUsd: usdAmountSchema,
  expiresAt: z
    .string()
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .optional()
});

export const tokenIdSchema = z.object({
  tokenId: z.string().uuid()
});

export const updateTokenSchema = z.object({
  name: z.string().trim().min(1).optional(),
  logicalModelId: z.string().uuid().optional(),
  budgetLimitUsd: usdAmountSchema.optional(),
  expiresAt: z
    .string()
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .nullable()
    .optional(),
  status: z.enum(['active', 'expired', 'exhausted']).optional()
});

export type CreateTokenInput = z.infer<typeof createTokenSchema>;
export type UpdateTokenInput = z.infer<typeof updateTokenSchema>;
