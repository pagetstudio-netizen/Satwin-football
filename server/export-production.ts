import pg from "pg";

const { Pool } = pg;

const SUPABASE_URL = process.env.SUPABASE_DATABASE_URL;

if (!SUPABASE_URL) {
  console.error("SUPABASE_DATABASE_URL must be set");
  process.exit(1);
}

const supabasePool = new Pool({ connectionString: SUPABASE_URL });

interface UserRow {
  id: number;
  full_name: string;
  phone: string;
  country: string;
  password: string;
  referral_code: string;
  referred_by: string | null;
  balance: string;
  today_earnings: string;
  total_earnings: string;
  is_admin: boolean;
  is_super_admin: boolean;
  is_banned: boolean;
  is_withdrawal_blocked: boolean;
  is_promoter: boolean;
  must_invite_to_withdraw: boolean;
  has_deposited: boolean;
  has_active_product: boolean;
  created_at: string;
  last_free_product_claim: string | null;
  last_daily_bonus_claim: string | null;
  promoter_set_by: number | null;
  admin_set_by: number | null;
  admin_set_at: string | null;
  admin_pin: string | null;
  is_admin_password_required: boolean;
}

async function insertUsers(users: UserRow[]) {
  console.log(`Inserting ${users.length} users...`);
  
  for (const user of users) {
    try {
      await supabasePool.query(`
        INSERT INTO users (id, full_name, phone, country, password, referral_code, referred_by, balance, today_earnings, total_earnings, is_admin, is_super_admin, is_banned, is_withdrawal_blocked, is_promoter, must_invite_to_withdraw, has_deposited, has_active_product, created_at, last_free_product_claim, last_daily_bonus_claim, promoter_set_by, admin_set_by, admin_set_at, admin_pin, is_admin_password_required)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
        ON CONFLICT (id) DO NOTHING
      `, [
        user.id, user.full_name, user.phone, user.country, user.password,
        user.referral_code, user.referred_by, user.balance, user.today_earnings,
        user.total_earnings, user.is_admin, user.is_super_admin, user.is_banned,
        user.is_withdrawal_blocked, user.is_promoter, user.must_invite_to_withdraw,
        user.has_deposited, user.has_active_product, user.created_at,
        user.last_free_product_claim, user.last_daily_bonus_claim, user.promoter_set_by,
        user.admin_set_by, user.admin_set_at, user.admin_pin, user.is_admin_password_required
      ]);
    } catch (err: any) {
      console.log(`Error inserting user ${user.id}: ${err.message}`);
    }
  }
}

async function run() {
  const result = await supabasePool.query("SELECT COUNT(*) FROM users");
  console.log(`Current users in Supabase: ${result.rows[0].count}`);
  await supabasePool.end();
}

run().catch(console.error);
