import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid
} from 'drizzle-orm/pg-core';
import { users } from './auth.js';
import { apiTokens, channelRoutes, channels } from './routing.js';

export const requestStatusEnum = pgEnum('request_status', [
  'in_progress',
  'success',
  'upstream_error',
  'stream_failed',
  'validation_failed',
  'quota_rejected',
  'review_required'
]);

export const routeAttemptStatusEnum = pgEnum('route_attempt_status', ['failed', 'succeeded']);
export const failureStageEnum = pgEnum('failure_stage', [
  'connect',
  'handshake',
  'upstream_error',
  'timeout',
  'protocol_parse'
]);

export const requestLogs = pgTable(
  'request_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    apiTokenId: uuid('api_token_id').references(() => apiTokens.id, { onDelete: 'set null' }),
    endpointType: text('endpoint_type').notNull(),
    logicalModelAlias: text('logical_model_alias').notNull(),
    finalChannelId: uuid('final_channel_id').references(() => channels.id, { onDelete: 'set null' }),
    finalRouteId: uuid('final_route_id').references(() => channelRoutes.id, {
      onDelete: 'set null'
    }),
    finalUpstreamModelId: text('final_upstream_model_id'),
    requestStatus: requestStatusEnum('request_status').notNull(),
    httpStatusCode: integer('http_status_code'),
    rawRequestSummary: jsonb('raw_request_summary'),
    rawUsageJson: jsonb('raw_usage_json'),
    eventSummaryJson: jsonb('event_summary_json'),
    rawUpstreamPriceUsd: numeric('raw_upstream_price_usd', { precision: 12, scale: 4 }),
    settlementPriceUsd: numeric('settlement_price_usd', { precision: 12, scale: 4 }),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    durationMs: integer('duration_ms'),
    errorSummary: text('error_summary'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true })
  },
  (table) => [
    index('request_logs_user_started_at_idx').on(table.userId, table.startedAt),
    index('request_logs_api_token_started_at_idx').on(table.apiTokenId, table.startedAt),
    index('request_logs_user_status_started_at_idx').on(
      table.userId,
      table.requestStatus,
      table.startedAt
    )
  ]
);

export const routeAttempts = pgTable(
  'route_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestLogId: uuid('request_log_id')
      .notNull()
      .references(() => requestLogs.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    routeId: uuid('route_id')
      .notNull()
      .references(() => channelRoutes.id, { onDelete: 'cascade' }),
    attemptIndex: integer('attempt_index').notNull(),
    attemptStatus: routeAttemptStatusEnum('attempt_status').notNull(),
    failureStage: failureStageEnum('failure_stage'),
    errorSummary: text('error_summary'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }).notNull()
  },
  (table) => [
    index('route_attempts_request_log_id_idx').on(table.requestLogId),
    index('route_attempts_channel_id_idx').on(table.channelId),
    index('route_attempts_route_id_idx').on(table.routeId)
  ]
);

export const priceSnapshots = pgTable(
  'price_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestLogId: uuid('request_log_id')
      .notNull()
      .references(() => requestLogs.id, { onDelete: 'cascade' }),
    pricingSource: text('pricing_source').notNull(),
    inputPricePer1m: numeric('input_price_per_1m', { precision: 12, scale: 4 }).notNull(),
    outputPricePer1m: numeric('output_price_per_1m', { precision: 12, scale: 4 }).notNull(),
    currency: text('currency').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index('price_snapshots_request_log_id_idx').on(table.requestLogId)]
);
