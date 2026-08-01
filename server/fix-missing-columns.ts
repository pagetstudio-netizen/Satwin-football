import pg from "pg";
const { Pool } = pg;

const url = process.env.SUPABASE_DATABASE_URL;
if (!url) throw new Error("SUPABASE_DATABASE_URL manquant");
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function main() {
  const client = await pool.connect();
  const exec = async (sql: string, label: string) => {
    try { await client.query(sql); console.log("✅", label); }
    catch (e: any) {
      if (e.message.includes("already exists") || e.message.includes("duplicate")) {
        console.log("⏭️  Déjà OK:", label);
      } else {
        console.log("❌", label, "→", e.message);
      }
    }
  };

  try {
    // Users — colonnes manquantes
    await exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp text`, "users.whatsapp");
    await exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram text`, "users.telegram");
    await exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS withdrawal_code text`, "users.withdrawal_code");
    await exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS security_question text`, "users.security_question");
    await exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS security_answer text`, "users.security_answer");
    await exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_bet_enabled boolean NOT NULL DEFAULT false`, "users.auto_bet_enabled");
    await exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS amount_shortcuts text`, "users.amount_shortcuts");
    await exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS withdrawal_unlocked boolean NOT NULL DEFAULT false`, "users.withdrawal_unlocked");

    // Withdrawals — colonne manquante
    await exec(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT ''`, "withdrawals.country");

    console.log("\n🎉 Colonnes manquantes ajoutées !");
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(e => { console.error("❌", e.message); process.exit(1); });
