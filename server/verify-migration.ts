import pg from "pg";
const { Pool } = pg;
async function main() {
  const dest = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const src  = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const tables = ["users","bets","matches","plan_b_users","payment_numbers","referral_commissions","platform_settings","transactions","products"];
    for (const t of tables) {
      let sc = 0, dc = 0;
      try { sc = (await src.query(`SELECT COUNT(*) FROM "${t}"`)).rows[0].count; } catch {}
      try { dc = (await dest.query(`SELECT COUNT(*) FROM "${t}"`)).rows[0].count; } catch {}
      const ok = sc == dc ? "✅" : "⚠️";
      console.log(`${ok} ${t.padEnd(24)} src:${sc}  dest:${dc}`);
    }
  } finally { await src.end(); await dest.end(); }
}
main().catch(e => { console.error(e.message); process.exit(1); });
