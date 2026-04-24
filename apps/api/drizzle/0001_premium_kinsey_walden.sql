CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_tokens_user_id_idx" ON "api_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_tokens_logical_model_id_idx" ON "api_tokens" USING btree ("logical_model_id");--> statement-breakpoint
CREATE INDEX "api_tokens_user_status_idx" ON "api_tokens" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "channel_routes_user_id_idx" ON "channel_routes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "channel_routes_channel_id_idx" ON "channel_routes" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "channel_routes_resolution_idx" ON "channel_routes" USING btree ("logical_model_id","status","priority");--> statement-breakpoint
CREATE INDEX "channels_user_id_idx" ON "channels" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "channels_user_status_idx" ON "channels" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "logical_models_user_id_idx" ON "logical_models" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "logical_models_user_alias_status_idx" ON "logical_models" USING btree ("user_id","alias","status");--> statement-breakpoint
CREATE INDEX "price_snapshots_request_log_id_idx" ON "price_snapshots" USING btree ("request_log_id");--> statement-breakpoint
CREATE INDEX "request_logs_user_started_at_idx" ON "request_logs" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "request_logs_api_token_started_at_idx" ON "request_logs" USING btree ("api_token_id","started_at");--> statement-breakpoint
CREATE INDEX "request_logs_user_status_started_at_idx" ON "request_logs" USING btree ("user_id","request_status","started_at");--> statement-breakpoint
CREATE INDEX "route_attempts_request_log_id_idx" ON "route_attempts" USING btree ("request_log_id");--> statement-breakpoint
CREATE INDEX "route_attempts_channel_id_idx" ON "route_attempts" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "route_attempts_route_id_idx" ON "route_attempts" USING btree ("route_id");