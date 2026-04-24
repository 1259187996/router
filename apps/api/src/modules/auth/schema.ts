import { z } from 'zod';

const passwordSchema = z.string().min(12);

export const loginBodySchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1)
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema
});

export const createUserSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  displayName: z.string().trim().min(1),
  password: passwordSchema,
  role: z.enum(['admin', 'user'])
});

export const userIdSchema = z.object({
  userId: z.string().uuid()
});

export const updateUserStatusSchema = z.object({
  status: z.enum(['active', 'disabled'])
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UserStatusInput = z.infer<typeof updateUserStatusSchema>['status'];
