CREATE TYPE "public"."user_role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."resource_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."token_status" AS ENUM('active', 'revoked', 'expired', 'exhausted');--> statement-breakpoint
CREATE TYPE "public"."failure_stage" AS ENUM('connect', 'handshake', 'upstream_error', 'timeout', 'protocol_parse');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('in_progress', 'success', 'upstream_error', 'stream_failed', 'validation_failed', 'quota_rejected', 'review_required');--> statement-breakpoint
CREATE TYPE "public"."route_attempt_status" AS ENUM('failed', 'succeeded');--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_sessions_session_token_hash_unique" UNIQUE("session_token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"status" "user_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"logical_model_id" uuid NOT NULL,
	"budget_limit_usd" numeric(12, 2) NOT NULL,
	"budget_used_usd" numeric(12, 2) NOT NULL,
	"expires_at" timestamp with time zone,
	"status" "token_status" NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "channel_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"logical_model_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"upstream_model_id" text,
	"input_price_per_1m" numeric(12, 4) NOT NULL,
	"output_price_per_1m" numeric(12, 4) NOT NULL,
	"currency" text NOT NULL,
	"priority" integer NOT NULL,
	"status" "resource_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"api_key_encrypted" text NOT NULL,
	"default_model_id" text NOT NULL,
	"status" "resource_status" NOT NULL,
	"last_test_status" text,
	"last_test_error" text,
	"last_tested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "logical_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"description" text NOT NULL,
	"status" "resource_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_log_id" uuid NOT NULL,
	"pricing_source" text NOT NULL,
	"input_price_per_1m" numeric(12, 4) NOT NULL,
	"output_price_per_1m" numeric(12, 4) NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"api_token_id" uuid,
	"endpoint_type" text NOT NULL,
	"logical_model_alias" text NOT NULL,
	"final_channel_id" uuid,
	"final_route_id" uuid,
	"final_upstream_model_id" text,
	"request_status" "request_status" NOT NULL,
	"http_status_code" integer,
	"raw_request_summary" jsonb,
	"raw_usage_json" jsonb,
	"event_summary_json" jsonb,
	"raw_upstream_price_usd" numeric(12, 4),
	"settlement_price_usd" numeric(12, 4),
	"input_tokens" integer,
	"output_tokens" integer,
	"duration_ms" integer,
	"error_summary" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "route_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_log_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"attempt_index" integer NOT NULL,
	"attempt_status" "route_attempt_status" NOT NULL,
	"failure_stage" "failure_stage",
	"error_summary" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_logical_model_id_logical_models_id_fk" FOREIGN KEY ("logical_model_id") REFERENCES "public"."logical_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_routes" ADD CONSTRAINT "channel_routes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_routes" ADD CONSTRAINT "channel_routes_logical_model_id_logical_models_id_fk" FOREIGN KEY ("logical_model_id") REFERENCES "public"."logical_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_routes" ADD CONSTRAINT "channel_routes_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logical_models" ADD CONSTRAINT "logical_models_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_request_log_id_request_logs_id_fk" FOREIGN KEY ("request_log_id") REFERENCES "public"."request_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_api_token_id_api_tokens_id_fk" FOREIGN KEY ("api_token_id") REFERENCES "public"."api_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_final_channel_id_channels_id_fk" FOREIGN KEY ("final_channel_id") REFERENCES "public"."channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_final_route_id_channel_routes_id_fk" FOREIGN KEY ("final_route_id") REFERENCES "public"."channel_routes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_attempts" ADD CONSTRAINT "route_attempts_request_log_id_request_logs_id_fk" FOREIGN KEY ("request_log_id") REFERENCES "public"."request_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_attempts" ADD CONSTRAINT "route_attempts_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_attempts" ADD CONSTRAINT "route_attempts_route_id_channel_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."channel_routes"("id") ON DELETE cascade ON UPDATE no action;