import {
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  uniqueIndex,
  text,
  timestamp,
  uuid
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './auth.js';

export const resourceStatusEnum = pgEnum('resource_status', ['active', 'disabled']);
export const tokenStatusEnum = pgEnum('token_status', ['active', 'revoked', 'expired', 'exhausted']);

export const channels = pgTable(
  'channels',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    baseUrl: text('base_url').notNull(),
    apiKeyEncrypted: text('api_key_encrypted').notNull(),
    defaultModelId: text('default_model_id').notNull(),
    status: resourceStatusEnum('status').notNull(),
    lastTestStatus: text('last_test_status'),
    lastTestError: text('last_test_error'),
    lastTestedAt: timestamp('last_tested_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index('channels_user_id_idx').on(table.userId),
    index('channels_user_status_idx').on(table.userId, table.status)
  ]
);

export const logicalModels = pgTable(
  'logical_models',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    alias: text('alias').notNull(),
    description: text('description').notNull(),
    status: resourceStatusEnum('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index('logical_models_user_id_idx').on(table.userId),
    index('logical_models_user_alias_status_idx').on(table.userId, table.alias, table.status),
    uniqueIndex('logical_models_user_alias_active_unique_idx')
      .on(table.userId, table.alias)
      .where(sql`${table.status} = 'active'`)
  ]
);

export const channelRoutes = pgTable(
  'channel_routes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    logicalModelId: uuid('logical_model_id')
      .notNull()
      .references(() => logicalModels.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    upstreamModelId: text('upstream_model_id'),
    inputPricePer1m: numeric('input_price_per_1m', { precision: 12, scale: 4 }).notNull(),
    outputPricePer1m: numeric('output_price_per_1m', { precision: 12, scale: 4 }).notNull(),
    currency: text('currency').notNull(),
    priority: integer('priority').notNull(),
    status: resourceStatusEnum('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index('channel_routes_user_id_idx').on(table.userId),
    index('channel_routes_channel_id_idx').on(table.channelId),
    index('channel_routes_resolution_idx').on(
      table.logicalModelId,
      table.status,
      table.priority
    ),
    check('channel_routes_priority_nonnegative_check', sql`${table.priority} >= 0`)
  ]
);

export const apiTokens = pgTable(
  'api_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    logicalModelId: uuid('logical_model_id')
      .notNull()
      .references(() => logicalModels.id, { onDelete: 'cascade' }),
    budgetLimitUsd: numeric('budget_limit_usd', { precision: 12, scale: 2 }).notNull(),
    budgetUsedUsd: numeric('budget_used_usd', { precision: 12, scale: 2 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    status: tokenStatusEnum('status').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index('api_tokens_user_id_idx').on(table.userId),
    index('api_tokens_logical_model_id_idx').on(table.logicalModelId),
    index('api_tokens_user_status_idx').on(table.userId, table.status)
  ]
);
