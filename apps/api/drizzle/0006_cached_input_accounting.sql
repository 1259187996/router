ALTER TABLE "channel_models" ADD COLUMN "cached_input_price_per_1m" numeric(12, 4) DEFAULT '0' NOT NULL;
ALTER TABLE "channel_routes" ADD COLUMN "cached_input_price_per_1m" numeric(12, 4) DEFAULT '0' NOT NULL;
ALTER TABLE "request_logs" ADD COLUMN "cached_input_tokens" integer;
ALTER TABLE "price_snapshots" ADD COLUMN "cached_input_price_per_1m" numeric(12, 4) DEFAULT '0' NOT NULL;
