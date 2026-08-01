/**
 * Crée les tables manquantes sur Supabase et migre leur contenu depuis la DB Replit.
 */
import pg from "pg";
const { Pool } = pg;

const srcPool  = new Pool({ connectionString: process.env.DATABASE_URL });
const destPool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function exec(client: pg.PoolClient, sql: string, label: string) {
  try { await client.query(sql); console.log("✅", label); }
  catch (e: any) {
    if (e.message.includes("already exists") || e.message.includes("duplicate")) console.log("⏭️  Déjà OK:", label);
    else console.log("❌", label, "→", e.message);
  }
}

async function migrateTable(name: string, orderBy = "id") {
  const src = await srcPool.query(`SELECT * FROM "${name}" ORDER BY ${orderBy}`);
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
    } catch (e: any) { console.log(`  ⚠️  ${name} row error: ${e.message}`); }
  }
  // reset serial
  try { await destPool.query(`SELECT setval(pg_get_serial_sequence('"${name}"', 'id'), COALESCE((SELECT MAX(id) FROM "${name}"), 1), true)`); } catch {}
  console.log(`✅ ${name}: ${ok}/${src.rows.length} lignes`);
}

async function main() {
  const dest = await destPool.connect();
  try {
    // ── Créer les tables manquantes ──────────────────────────────────────────

    // matches
    await exec(dest, `
      CREATE TABLE IF NOT EXISTS "matches" (
        "id" serial PRIMARY KEY,
        "fixture_id" integer NOT NULL UNIQUE,
        "home_team" text NOT NULL,
        "away_team" text NOT NULL,
        "home_logo" text,
        "away_logo" text,
        "league_name" text,
        "league_logo" text,
        "match_date" timestamp NOT NULL,
        "status" text NOT NULL DEFAULT 'upcoming',
        "home_score" integer,
        "away_score" integer,
        "is_active" boolean NOT NULL DEFAULT true,
        "vip_rate" decimal(5,2) NOT NULL DEFAULT 0,
        "normal_rate" decimal(5,2) NOT NULL DEFAULT 0,
        "created_at" timestamp NOT NULL DEFAULT now()
      )
    `, "Table matches");

    // bets
    await exec(dest, `
      CREATE TABLE IF NOT EXISTS "bets" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id"),
        "match_id" integer NOT NULL REFERENCES "matches"("id"),
        "amount" integer NOT NULL,
        "predicted_outcome" text NOT NULL,
        "status" text NOT NULL DEFAULT 'pending',
        "potential_win" integer NOT NULL DEFAULT 0,
        "actual_win" integer,
        "rate_used" decimal(5,2) NOT NULL DEFAULT 0,
        "is_vip" boolean NOT NULL DEFAULT false,
        "identifier" text,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "settled_at" timestamp
      )
    `, "Table bets");

    // plan_b_users
    await exec(dest, `
      CREATE TABLE IF NOT EXISTS "plan_b_users" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id"),
        "added_by" integer REFERENCES "users"("id"),
        "added_at" timestamp NOT NULL DEFAULT now()
      )
    `, "Table plan_b_users");

    // Colonnes manquantes éventuelles sur matches
    await exec(dest, `ALTER TABLE matches ADD COLUMN IF NOT EXISTS country text`, "matches.country");
    await exec(dest, `ALTER TABLE matches ADD COLUMN IF NOT EXISTS round text`, "matches.round");

    // Colonnes manquantes éventuelles sur bets  
    await exec(dest, `ALTER TABLE bets ADD COLUMN IF NOT EXISTS transaction_id integer`, "bets.transaction_id");

    dest.release();

    // ── Migrer les données ───────────────────────────────────────────────────
    console.log("\n--- Migration des données ---");
    await migrateTable("matches", "id");
    await migrateTable("bets", "id");
    await migrateTable("plan_b_users", "id");
    await migrateTable("payment_numbers", "id");
    await migrateTable("referral_commissions", "id");

    console.log("\n🎉 Tables manquantes créées et données migrées !");
  } catch (e: any) {
    dest.release();
    throw e;
  }
}

main().catch(e => { console.error("❌ Erreur fatale:", e.message); process.exit(1); });
