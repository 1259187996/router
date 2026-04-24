WITH ranked_active_logical_models AS (
	SELECT
		"id",
		"user_id",
		"alias",
		first_value("id") OVER (
			PARTITION BY "user_id", "alias"
			ORDER BY "created_at" ASC, "id" ASC
		) AS "survivor_id",
		row_number() OVER (
			PARTITION BY "user_id", "alias"
			ORDER BY "created_at" ASC, "id" ASC
		) AS "row_num"
	FROM "logical_models"
	WHERE "status" = 'active'
),
duplicate_active_logical_models AS (
	SELECT
		"id",
		"survivor_id"
	FROM ranked_active_logical_models
	WHERE "row_num" > 1
)
UPDATE "channel_routes" AS "cr"
SET
	"logical_model_id" = "duplicates"."survivor_id",
	"updated_at" = now()
FROM duplicate_active_logical_models AS "duplicates"
WHERE "cr"."logical_model_id" = "duplicates"."id";--> statement-breakpoint
WITH ranked_active_logical_models AS (
	SELECT
		"id",
		"user_id",
		"alias",
		first_value("id") OVER (
			PARTITION BY "user_id", "alias"
			ORDER BY "created_at" ASC, "id" ASC
		) AS "survivor_id",
		row_number() OVER (
			PARTITION BY "user_id", "alias"
			ORDER BY "created_at" ASC, "id" ASC
		) AS "row_num"
	FROM "logical_models"
	WHERE "status" = 'active'
),
duplicate_active_logical_models AS (
	SELECT
		"id",
		"survivor_id"
	FROM ranked_active_logical_models
	WHERE "row_num" > 1
)
UPDATE "api_tokens" AS "tokens"
SET
	"logical_model_id" = "duplicates"."survivor_id",
	"updated_at" = now()
FROM duplicate_active_logical_models AS "duplicates"
WHERE "tokens"."logical_model_id" = "duplicates"."id";--> statement-breakpoint
WITH ranked_active_logical_models AS (
	SELECT
		"id",
		"user_id",
		"alias",
		row_number() OVER (
			PARTITION BY "user_id", "alias"
			ORDER BY "created_at" ASC, "id" ASC
		) AS "row_num"
	FROM "logical_models"
	WHERE "status" = 'active'
)
UPDATE "logical_models" AS "lm"
SET
	"status" = 'disabled',
	"updated_at" = now()
FROM ranked_active_logical_models AS "ranked"
WHERE "lm"."id" = "ranked"."id"
	AND "ranked"."row_num" > 1;--> statement-breakpoint
WITH route_priority_offsets AS (
	SELECT
		"logical_model_id",
		-min("priority") AS "priority_offset"
	FROM "channel_routes"
	GROUP BY "logical_model_id"
	HAVING min("priority") < 0
)
UPDATE "channel_routes" AS "cr"
SET
	"priority" = "cr"."priority" + "offsets"."priority_offset",
	"updated_at" = now()
FROM route_priority_offsets AS "offsets"
WHERE "cr"."logical_model_id" = "offsets"."logical_model_id";--> statement-breakpoint
CREATE UNIQUE INDEX "logical_models_user_alias_active_unique_idx" ON "logical_models" USING btree ("user_id","alias") WHERE "logical_models"."status" = 'active';--> statement-breakpoint
ALTER TABLE "channel_routes" ADD CONSTRAINT "channel_routes_priority_nonnegative_check" CHECK ("channel_routes"."priority" >= 0);
