import pg from "pg";
const { Pool } = pg;

const url = process.env.SUPABASE_DATABASE_URL;
if (!url) throw new Error("SUPABASE_DATABASE_URL manquant");
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function fix() {
  const client = await pool.connect();
  const exec = async (sql: string, label: string) => {
    try { await client.query(sql); console.log("✅", label); }
    catch (e: any) { if (e.message.includes("already exists") || e.message.includes("duplicate")) { console.log("⏭️  Déjà OK:", label); } else { console.log("❌", label, "→", e.message); } }
  };

  try {
    // Fix user_products table
    await exec(`ALTER TABLE user_products ADD COLUMN IF NOT EXISTS days_remaining integer NOT NULL DEFAULT 80`, "user_products.days_remaining");
    await exec(`ALTER TABLE user_products ADD COLUMN IF NOT EXISTS total_earned decimal(15,2) NOT NULL DEFAULT 0`, "user_products.total_earned");
    await exec(`ALTER TABLE user_products ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true`, "user_products.is_active");
    await exec(`ALTER TABLE user_products ADD COLUMN IF NOT EXISTS assigned_by_admin boolean NOT NULL DEFAULT false`, "user_products.assigned_by_admin");
    // Remove unused columns from user_products if they exist
    await exec(`ALTER TABLE user_products DROP COLUMN IF EXISTS earnings_collected`, "drop user_products.earnings_collected");
    await exec(`ALTER TABLE user_products DROP COLUMN IF EXISTS status`, "drop user_products.status");
    await exec(`ALTER TABLE user_products DROP COLUMN IF EXISTS cycle_end_date`, "drop user_products.cycle_end_date");
    await exec(`ALTER TABLE user_products DROP COLUMN IF EXISTS total_earnings_target`, "drop user_products.total_earnings_target");

    // Fix tasks table
    await exec(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0`, "tasks.sort_order");
    await exec(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT ''`, "tasks.description (not null)");

    // Fix user_tasks table
    await exec(`ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS reward_claimed boolean NOT NULL DEFAULT true`, "user_tasks.reward_claimed");

    // Fix deposits table - drop wrong cols, add correct ones
    await exec(`ALTER TABLE deposits DROP COLUMN IF EXISTS admin_note`, "drop deposits.admin_note");
    await exec(`ALTER TABLE deposits DROP COLUMN IF EXISTS updated_at`, "drop deposits.updated_at");
    await exec(`ALTER TABLE deposits ADD COLUMN IF NOT EXISTS account_name text NOT NULL DEFAULT ''`, "deposits.account_name");
    await exec(`ALTER TABLE deposits ADD COLUMN IF NOT EXISTS account_number text NOT NULL DEFAULT ''`, "deposits.account_number");
    await exec(`ALTER TABLE deposits ADD COLUMN IF NOT EXISTS payment_channel_id integer`, "deposits.payment_channel_id");
    await exec(`ALTER TABLE deposits ADD COLUMN IF NOT EXISTS soleaspay_reference text`, "deposits.soleaspay_reference");
    await exec(`ALTER TABLE deposits ADD COLUMN IF NOT EXISTS soleaspay_order_id text`, "deposits.soleaspay_order_id");
    await exec(`ALTER TABLE deposits ADD COLUMN IF NOT EXISTS inpay_order_number text`, "deposits.inpay_order_number");
    await exec(`ALTER TABLE deposits ADD COLUMN IF NOT EXISTS inpay_out_trade_no text`, "deposits.inpay_out_trade_no");
    await exec(`ALTER TABLE deposits ADD COLUMN IF NOT EXISTS omnipay_id text`, "deposits.omnipay_id");
    await exec(`ALTER TABLE deposits ADD COLUMN IF NOT EXISTS omnipay_reference text`, "deposits.omnipay_reference");
    await exec(`ALTER TABLE deposits ADD COLUMN IF NOT EXISTS processed_at timestamp`, "deposits.processed_at");
    await exec(`ALTER TABLE deposits ADD COLUMN IF NOT EXISTS processed_by integer`, "deposits.processed_by");
    // Change amount to integer
    await exec(`ALTER TABLE deposits ALTER COLUMN amount TYPE integer USING amount::integer`, "deposits.amount → integer");

    // Fix withdrawals table
    await exec(`ALTER TABLE withdrawals DROP COLUMN IF EXISTS wallet_id`, "drop withdrawals.wallet_id");
    await exec(`ALTER TABLE withdrawals DROP COLUMN IF EXISTS admin_note`, "drop withdrawals.admin_note");
    await exec(`ALTER TABLE withdrawals DROP COLUMN IF EXISTS updated_at`, "drop withdrawals.updated_at");
    await exec(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS net_amount integer NOT NULL DEFAULT 0`, "withdrawals.net_amount");
    await exec(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS fees integer NOT NULL DEFAULT 0`, "withdrawals.fees");
    await exec(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS account_name text NOT NULL DEFAULT ''`, "withdrawals.account_name");
    await exec(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS account_number text NOT NULL DEFAULT ''`, "withdrawals.account_number");
    await exec(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT ''`, "withdrawals.payment_method");
    await exec(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS inpay_order_number text`, "withdrawals.inpay_order_number");
    await exec(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS inpay_out_trade_no text`, "withdrawals.inpay_out_trade_no");
    await exec(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS omnipay_id text`, "withdrawals.omnipay_id");
    await exec(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS omnipay_reference text`, "withdrawals.omnipay_reference");
    await exec(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS processed_at timestamp`, "withdrawals.processed_at");
    await exec(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS processed_by integer`, "withdrawals.processed_by");
    await exec(`ALTER TABLE withdrawals ALTER COLUMN amount TYPE integer USING amount::integer`, "withdrawals.amount → integer");

    // Fix payment_channels
    await exec(`ALTER TABLE payment_channels DROP COLUMN IF EXISTS description`, "drop payment_channels.description");
    await exec(`ALTER TABLE payment_channels DROP COLUMN IF EXISTS sort_order`, "drop payment_channels.sort_order");
    await exec(`ALTER TABLE payment_channels ADD COLUMN IF NOT EXISTS redirect_url text NOT NULL DEFAULT ''`, "payment_channels.redirect_url");
    await exec(`ALTER TABLE payment_channels ADD COLUMN IF NOT EXISTS is_api boolean NOT NULL DEFAULT false`, "payment_channels.is_api");
    await exec(`ALTER TABLE payment_channels ADD COLUMN IF NOT EXISTS created_at timestamp NOT NULL DEFAULT now()`, "payment_channels.created_at");
    await exec(`ALTER TABLE payment_channels ADD COLUMN IF NOT EXISTS modified_by integer`, "payment_channels.modified_by");
    await exec(`ALTER TABLE payment_channels ADD COLUMN IF NOT EXISTS modified_at timestamp`, "payment_channels.modified_at");

    // Fix payment_numbers
    await exec(`ALTER TABLE payment_numbers ADD COLUMN IF NOT EXISTS created_at timestamp NOT NULL DEFAULT now()`, "payment_numbers.created_at");
    await exec(`ALTER TABLE payment_numbers ADD COLUMN IF NOT EXISTS created_by integer`, "payment_numbers.created_by");

    // Fix staking_products - drop wrong, add correct
    await exec(`ALTER TABLE staking_products DROP COLUMN IF EXISTS min_amount`, "drop staking_products.min_amount");
    await exec(`ALTER TABLE staking_products DROP COLUMN IF EXISTS max_amount`, "drop staking_products.max_amount");
    await exec(`ALTER TABLE staking_products DROP COLUMN IF EXISTS duration_days`, "drop staking_products.duration_days");
    await exec(`ALTER TABLE staking_products DROP COLUMN IF EXISTS interest_rate`, "drop staking_products.interest_rate");
    await exec(`ALTER TABLE staking_products ADD COLUMN IF NOT EXISTS description text`, "staking_products.description");
    await exec(`ALTER TABLE staking_products ADD COLUMN IF NOT EXISTS price integer NOT NULL DEFAULT 0`, "staking_products.price");
    await exec(`ALTER TABLE staking_products ADD COLUMN IF NOT EXISTS return_amount integer NOT NULL DEFAULT 0`, "staking_products.return_amount");
    await exec(`ALTER TABLE staking_products ADD COLUMN IF NOT EXISTS lock_days integer NOT NULL DEFAULT 30`, "staking_products.lock_days");
    await exec(`ALTER TABLE staking_products ADD COLUMN IF NOT EXISTS launch_date timestamp`, "staking_products.launch_date");
    await exec(`ALTER TABLE staking_products ADD COLUMN IF NOT EXISTS image_url text`, "staking_products.image_url");
    await exec(`ALTER TABLE staking_products ADD COLUMN IF NOT EXISTS created_at timestamp NOT NULL DEFAULT now()`, "staking_products.created_at");
    await exec(`ALTER TABLE staking_products ADD COLUMN IF NOT EXISTS created_by integer`, "staking_products.created_by");

    // Fix user_stakings - drop wrong, add correct
    await exec(`ALTER TABLE user_stakings DROP COLUMN IF EXISTS amount`, "drop user_stakings.amount");
    await exec(`ALTER TABLE user_stakings DROP COLUMN IF EXISTS interest_earned`, "drop user_stakings.interest_earned");
    await exec(`ALTER TABLE user_stakings DROP COLUMN IF EXISTS start_date`, "drop user_stakings.start_date");
    await exec(`ALTER TABLE user_stakings DROP COLUMN IF EXISTS end_date`, "drop user_stakings.end_date");
    await exec(`ALTER TABLE user_stakings DROP COLUMN IF EXISTS released_at`, "drop user_stakings.released_at");
    await exec(`ALTER TABLE user_stakings ADD COLUMN IF NOT EXISTS amount_paid integer NOT NULL DEFAULT 0`, "user_stakings.amount_paid");
    await exec(`ALTER TABLE user_stakings ADD COLUMN IF NOT EXISTS return_amount integer NOT NULL DEFAULT 0`, "user_stakings.return_amount");
    await exec(`ALTER TABLE user_stakings ADD COLUMN IF NOT EXISTS purchased_at timestamp NOT NULL DEFAULT now()`, "user_stakings.purchased_at");
    await exec(`ALTER TABLE user_stakings ADD COLUMN IF NOT EXISTS release_date timestamp NOT NULL DEFAULT now()`, "user_stakings.release_date");
    await exec(`ALTER TABLE user_stakings ADD COLUMN IF NOT EXISTS released_at timestamp`, "user_stakings.released_at");

    // Fix referral_commissions
    await exec(`ALTER TABLE referral_commissions ADD COLUMN IF NOT EXISTS product_id integer`, "referral_commissions.product_id");

    // Fix transactions
    await exec(`ALTER TABLE transactions ALTER COLUMN amount TYPE decimal(15,2) USING amount::decimal`, "transactions.amount → decimal");
    await exec(`ALTER TABLE transactions ALTER COLUMN description SET NOT NULL`, "transactions.description not null");

    // Fix platform_settings
    await exec(`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS modified_by integer`, "platform_settings.modified_by");
    await exec(`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS modified_at timestamp`, "platform_settings.modified_at");

    // Create gift_codes table
    await exec(`
      CREATE TABLE IF NOT EXISTS "gift_codes" (
        "id" serial PRIMARY KEY,
        "code" text NOT NULL UNIQUE,
        "amount" decimal(15,2) NOT NULL,
        "max_uses" integer NOT NULL,
        "current_uses" integer NOT NULL DEFAULT 0,
        "expires_at" timestamp NOT NULL,
        "created_by" integer NOT NULL REFERENCES "users"("id"),
        "created_at" timestamp NOT NULL DEFAULT now(),
        "is_active" boolean NOT NULL DEFAULT true
      )
    `, "Table gift_codes");

    // Create gift_code_claims table
    await exec(`
      CREATE TABLE IF NOT EXISTS "gift_code_claims" (
        "id" serial PRIMARY KEY,
        "gift_code_id" integer NOT NULL REFERENCES "gift_codes"("id"),
        "user_id" integer NOT NULL REFERENCES "users"("id"),
        "claimed_at" timestamp NOT NULL DEFAULT now()
      )
    `, "Table gift_code_claims");

    // Update tasks sort_order values
    await exec(`UPDATE tasks SET sort_order = id WHERE sort_order = 0`, "tasks sort_order update");

    console.log("\n🎉 Schéma Supabase corrigé avec succès !");
  } finally {
    client.release();
    await pool.end();
  }
}

fix().catch(e => { console.error("❌ Erreur fatale:", e.message); process.exit(1); });
