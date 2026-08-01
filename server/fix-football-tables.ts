import pg from "pg";
const { Pool } = pg;

const srcPool  = new Pool({ connectionString: process.env.DATABASE_URL });
const destPool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function migrateTable(name: string) {
  const src = await srcPool.query(`SELECT * FROM "${name}" ORDER BY id`);
  if (src.rows.length === 0) { console.log(`⏭️  ${name}: vide`); return; }
  const cols = Object.keys(src.rows[0]);
  const colNames = cols.map(c => `"${c}"`).join(", ");
  let ok = 0;
  for (const row of src.rows) {
    const vals = cols.map(c => row[c]);
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
    try {
      await destPool.query(`INSERT INTO "${name}" (${colNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, vals);
      ok++;
    } catch (e: any) { console.log(`  ⚠️  ${name} row: ${e.message.split("\n")[0]}`); }
  }
  try { await destPool.query(`SELECT setval(pg_get_serial_sequence('"${name}"', 'id'), COALESCE((SELECT MAX(id) FROM "${name}"), 1), true)`); } catch {}
  console.log(`✅ ${name}: ${ok}/${src.rows.length} lignes`);
}

async function main() {
  const dest = await destPool.connect();
  try {
    // Drop and recreate matches with exact source schema
    await dest.query(`DROP TABLE IF EXISTS "bets" CASCADE`);
    await dest.query(`DROP TABLE IF EXISTS "matches" CASCADE`);
    console.log("✅ Anciennes tables matches/bets supprimées");

    await dest.query(`
      CREATE TABLE "matches" (
        "id" serial PRIMARY KEY,
        "home_team" text NOT NULL,
        "away_team" text NOT NULL,
        "home_flag" text,
        "away_flag" text,
        "predicted_score" text,
        "profit_rate" decimal(5,2) NOT NULL DEFAULT 0,
        "match_date" timestamp NOT NULL,
        "min_bet" integer NOT NULL DEFAULT 500,
        "max_bet" integer NOT NULL DEFAULT 100000,
        "status" text NOT NULL DEFAULT 'upcoming',
        "real_score" text,
        "result" text,
        "league" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "created_by" integer,
        "external_id" text,
        "live_score" text,
        "is_featured" boolean NOT NULL DEFAULT false,
        "is_vip_only" boolean NOT NULL DEFAULT false
      )
    `);
    console.log("✅ Table matches recréée");

    await dest.query(`
      CREATE TABLE "bets" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id"),
        "match_id" integer NOT NULL REFERENCES "matches"("id"),
        "amount" decimal(15,2) NOT NULL,
        "status" text NOT NULL DEFAULT 'pending',
        "profit" decimal(15,2) NOT NULL DEFAULT 0,
        "placed_at" timestamp NOT NULL DEFAULT now(),
        "settled_at" timestamp,
        "chosen_score" text
      )
    `);
    console.log("✅ Table bets recréée");

    dest.release();

    // Migrate data
    console.log("\n--- Migration des données ---");
    await migrateTable("matches");
    await migrateTable("bets");
    await migrateTable("plan_b_users");
    await migrateTable("payment_numbers");
    await migrateTable("referral_commissions");

    console.log("\n🎉 Tables football migrées avec succès !");
  } catch (e: any) {
    try { dest.release(); } catch {}
    throw e;
  } finally {
    await srcPool.end();
    await destPool.end();
  }
}

main().catch(e => { console.error("❌ Erreur fatale:", e.message); process.exit(1); });
