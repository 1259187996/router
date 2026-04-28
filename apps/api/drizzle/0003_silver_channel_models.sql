CREATE TABLE "channel_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"upstream_model_id" text NOT NULL,
	"input_price_per_1m" numeric(12, 4) NOT NULL,
	"output_price_per_1m" numeric(12, 4) NOT NULL,
	"currency" text NOT NULL,
	"status" "resource_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_routes" ADD COLUMN "channel_model_id" uuid;--> statement-breakpoint
ALTER TABLE "channel_models" ADD CONSTRAINT "channel_models_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_models" ADD CONSTRAINT "channel_models_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_routes" ADD CONSTRAINT "channel_routes_channel_model_id_channel_models_id_fk" FOREIGN KEY ("channel_model_id") REFERENCES "public"."channel_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channel_models_user_id_idx" ON "channel_models" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "channel_models_channel_id_idx" ON "channel_models" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "channel_models_channel_status_idx" ON "channel_models" USING btree ("channel_id","status");--> statement-breakpoint
INSERT INTO "channel_models" (
	"user_id",
	"channel_id",
	"upstream_model_id",
	"input_price_per_1m",
	"output_price_per_1m",
	"currency",
	"status",
	"created_at",
	"updated_at"
)
SELECT
	"user_id",
	"id",
	"default_model_id",
	'0.0000',
	'0.0000',
	'USD',
	"status",
	"created_at",
	"updated_at"
FROM "channels"
WHERE "default_model_id" <> '';--> statement-breakpoint
UPDATE "channel_routes" AS "routes"
SET
	"channel_model_id" = "models"."id",
	"updated_at" = now()
FROM "channel_models" AS "models"
WHERE "routes"."channel_id" = "models"."channel_id"
	AND "routes"."user_id" = "models"."user_id"
	AND "routes"."upstream_model_id" = "models"."upstream_model_id";
