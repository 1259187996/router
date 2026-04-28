import { z } from 'zod';
import { loadEnvFiles } from './load-env.js';

loadEnvFiles();

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isLocalRuntime = nodeEnv === 'development' || nodeEnv === 'test';
const defaultLocalEncryptionSecret = 'dev-test-channel-key-encryption-secret-32';

const booleanStringSchema = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z.object({
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: isLocalRuntime
    ? z.string().url().default('postgres://router:router@localhost:5432/router')
    : z.string().url(),
  TEST_DATABASE_URL: z.string().url().default('postgres://router:router@localhost:5432/router_test'),
  CREATE_DATABASE_BEFORE_MIGRATE: booleanStringSchema,
  ADMIN_EMAIL: z.string().trim().min(1).default('admin'),
  ADMIN_PASSWORD_HASH: z
    .string()
    .min(1)
    .default('$argon2id$v=19$m=65536,t=3,p=4$2ZUI/3GPEaN1FWA8LrybwA$cJn1yIT9IG/XoG2yjVBcbDMRWUYtT4fO6OfTqstbJOs'),
  ALLOW_PRIVATE_UPSTREAM_BASE_URLS: z
    .enum(['true', 'false'])
    .default(isLocalRuntime ? 'true' : 'false')
    .transform((value) => value === 'true'),
  CHANNEL_TEST_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  SESSION_COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default(isLocalRuntime ? 'false' : 'true')
    .transform((value) => value === 'true'),
  CHANNEL_KEY_ENCRYPTION_SECRET: isLocalRuntime
    ? z.string().min(32).default(defaultLocalEncryptionSecret)
    : z.string().min(32)
});

export const env = envSchema.parse(process.env);

export type Env = typeof env;
