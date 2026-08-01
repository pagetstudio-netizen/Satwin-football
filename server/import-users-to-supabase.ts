import pg from "pg";
import fs from "fs";

const { Pool } = pg;

const SUPABASE_URL = process.env.SUPABASE_DATABASE_URL;

if (!SUPABASE_URL) {
  console.error("SUPABASE_DATABASE_URL must be set");
  process.exit(1);
}

const pool = new Pool({ connectionString: SUPABASE_URL });

interface UserData {
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

async function importUsers(users: UserData[]) {
  let inserted = 0;
  let errors = 0;

  for (const user of users) {
    try {
      await pool.query(`
        INSERT INTO users (
          id, full_name, phone, country, password, referral_code, referred_by,
          balance, today_earnings, total_earnings, is_admin, is_super_admin,
          is_banned, is_withdrawal_blocked, is_promoter, must_invite_to_withdraw,
          has_deposited, has_active_product, created_at, last_free_product_claim,
          last_daily_bonus_claim, promoter_set_by, admin_set_by, admin_set_at,
          admin_pin, is_admin_password_required
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
        ON CONFLICT (id) DO NOTHING
      `, [
        user.id, user.full_name, user.phone, user.country, user.password,
        user.referral_code, user.referred_by || null, user.balance, user.today_earnings,
        user.total_earnings, user.is_admin, user.is_super_admin, user.is_banned,
        user.is_withdrawal_blocked, user.is_promoter, user.must_invite_to_withdraw,
        user.has_deposited, user.has_active_product, user.created_at,
        user.last_free_product_claim || null, user.last_daily_bonus_claim || null,
        user.promoter_set_by || null, user.admin_set_by || null, user.admin_set_at || null,
        user.admin_pin || null, user.is_admin_password_required
      ]);
      inserted++;
    } catch (err: any) {
      console.log(`Error inserting user ${user.id}: ${err.message}`);
      errors++;
    }
  }

  return { inserted, errors };
}

async function run() {
  const dataFile = process.argv[2];
  
  if (!dataFile) {
    console.log("Usage: npx tsx server/import-users-to-supabase.ts <json-file>");
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(dataFile, "utf-8"));
  console.log(`Importing ${data.length} users...`);
  
  const result = await importUsers(data);
  console.log(`Inserted: ${result.inserted}, Errors: ${result.errors}`);

  const maxId = await pool.query("SELECT MAX(id) as max FROM users");
  if (maxId.rows[0].max) {
    await pool.query(`SELECT setval('users_id_seq', $1, true)`, [maxId.rows[0].max]);
    console.log(`Sequence reset to ${maxId.rows[0].max}`);
  }

  await pool.end();
}

run().catch(console.error);
