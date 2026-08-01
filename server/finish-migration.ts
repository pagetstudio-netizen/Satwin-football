import pg from "pg";
const { Pool } = pg;

const src  = new Pool({ connectionString: process.env.DATABASE_URL });
const dest = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function bulkMigrate(table: string) {
  const rows = (await src.query(`SELECT * FROM "${table}" ORDER BY id`)).rows;
  if (!rows.length) { console.log(`⏭️  ${table}: vide`); return; }
  
  // Get missing IDs only
  const destIds = new Set(
    (await dest.query(`SELECT id FROM "${table}"`)).rows.map((r: any) => r.id)
  );
  const missing = rows.filter((r: any) => !destIds.has(r.id));
  if (!missing.length) { console.log(`✅ ${table}: déjà complet`); return; }

  const cols = Object.keys(rows[0]);
  const colNames = cols.map(c => `"${c}"`).join(", ");
  let ok = 0;
  // Insert in batches of 50
  for (let i = 0; i < missing.length; i += 50) {
    const batch = missing.slice(i, i + 50);
    for (const row of batch) {
      const vals = cols.map(c => row[c]);
      const ph = vals.map((_, j) => `$${j + 1}`).join(", ");
      try {
        await dest.query(`INSERT INTO "${table}" (${colNames}) VALUES (${ph}) ON CONFLICT DO NOTHING`, vals);
        ok++;
      } catch (e: any) { console.log(`  ⚠️  ${e.message.split("\n")[0]}`); }
    }
    process.stdout.write(`  ${table}: ${ok}/${missing.length}\r`);
  }
  try { await dest.query(`SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), (SELECT MAX(id) FROM "${table}"), true)`); } catch {}
  console.log(`✅ ${table}: ${ok}/${missing.length} nouvelles lignes`);
}

async function main() {
  await bulkMigrate("matches");
  await bulkMigrate("bets");
  await src.end();
  await dest.end();
  console.log("🎉 Migration complète !");
}
main().catch(e => { console.error("❌", e.message); process.exit(1); });
