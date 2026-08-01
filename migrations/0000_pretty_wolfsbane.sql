CREATE TABLE "admin_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer NOT NULL,
	"action" text NOT NULL,
	"target_user_id" integer,
	"details" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"phone_prefix" text NOT NULL,
	"operators" text DEFAULT '[]' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "countries_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "deposits" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"account_name" text NOT NULL,
	"account_number" text NOT NULL,
	"country" text NOT NULL,
	"payment_method" text NOT NULL,
	"payment_channel_id" integer,
	"payment_number_id" integer,
	"channel_name" text,
	"screenshot" text,
	"payment_message" text,
	"reference" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"soleaspay_reference" text,
	"soleaspay_order_id" text,
	"inpay_order_number" text,
	"inpay_out_trade_no" text,
	"omnipay_id" text,
	"omnipay_reference" text,
	"sendavapay_reference" text,
	"sendavapay_token" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"processed_by" integer
);
--> statement-breakpoint
CREATE TABLE "gift_code_claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"gift_code_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gift_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"max_uses" integer NOT NULL,
	"current_uses" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "gift_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "payment_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"redirect_url" text NOT NULL,
	"is_api" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"modified_by" integer,
	"modified_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "payment_numbers" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_name" text NOT NULL,
	"phone" text NOT NULL,
	"operator_name" text NOT NULL,
	"country" text NOT NULL,
	"logo_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"modified_by" integer,
	"modified_at" timestamp,
	CONSTRAINT "platform_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price" integer NOT NULL,
	"daily_earnings" integer NOT NULL,
	"cycle_days" integer DEFAULT 80 NOT NULL,
	"total_return" integer NOT NULL,
	"image_url" text,
	"is_free" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_commissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"from_user_id" integer NOT NULL,
	"level" integer NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"product_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staking_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" integer NOT NULL,
	"return_amount" integer NOT NULL,
	"lock_days" integer NOT NULL,
	"launch_date" timestamp,
	"image_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"required_invites" integer NOT NULL,
	"reward" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"purchase_date" timestamp DEFAULT now() NOT NULL,
	"last_earning_date" timestamp,
	"days_remaining" integer NOT NULL,
	"total_earned" numeric(15, 2) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"assigned_by_admin" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_stakings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"staking_product_id" integer NOT NULL,
	"amount_paid" integer NOT NULL,
	"return_amount" integer NOT NULL,
	"purchased_at" timestamp DEFAULT now() NOT NULL,
	"release_date" timestamp NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"released_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"task_id" integer NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL,
	"reward_claimed" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"country" text NOT NULL,
	"password" text NOT NULL,
	"referral_code" text NOT NULL,
	"referred_by" text,
	"balance" numeric(15, 2) DEFAULT '200' NOT NULL,
	"today_earnings" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_earnings" numeric(15, 2) DEFAULT '0' NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"is_banned" boolean DEFAULT false NOT NULL,
	"is_withdrawal_blocked" boolean DEFAULT false NOT NULL,
	"is_promoter" boolean DEFAULT false NOT NULL,
	"must_invite_to_withdraw" boolean DEFAULT false NOT NULL,
	"has_deposited" boolean DEFAULT false NOT NULL,
	"has_active_product" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_free_product_claim" timestamp,
	"last_daily_bonus_claim" timestamp,
	"promoter_set_by" integer,
	"admin_set_by" integer,
	"admin_set_at" timestamp,
	"admin_pin" text,
	"is_admin_password_required" boolean DEFAULT true NOT NULL,
	"is_banker" boolean DEFAULT false NOT NULL,
	"banker_set_by" integer,
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE "withdrawal_wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"account_name" text NOT NULL,
	"account_number" text NOT NULL,
	"payment_method" text NOT NULL,
	"country" text NOT NULL,
	"is_default" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "withdrawals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"net_amount" integer NOT NULL,
	"fees" integer NOT NULL,
	"account_name" text NOT NULL,
	"account_number" text NOT NULL,
	"country" text NOT NULL,
	"payment_method" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"inpay_order_number" text,
	"inpay_out_trade_no" text,
	"omnipay_id" text,
	"omnipay_reference" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"processed_by" integer
);
--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_code_claims" ADD CONSTRAINT "gift_code_claims_gift_code_id_gift_codes_id_fk" FOREIGN KEY ("gift_code_id") REFERENCES "public"."gift_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_code_claims" ADD CONSTRAINT "gift_code_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_codes" ADD CONSTRAINT "gift_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_products" ADD CONSTRAINT "user_products_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_products" ADD CONSTRAINT "user_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stakings" ADD CONSTRAINT "user_stakings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stakings" ADD CONSTRAINT "user_stakings_staking_product_id_staking_products_id_fk" FOREIGN KEY ("staking_product_id") REFERENCES "public"."staking_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tasks" ADD CONSTRAINT "user_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tasks" ADD CONSTRAINT "user_tasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_wallets" ADD CONSTRAINT "withdrawal_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;