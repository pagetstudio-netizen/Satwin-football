import pg from "pg";
const { Pool } = pg;
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const res = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`);
    console.log("Tables source:", res.rows.map((r: any) => r.table_name).join(", "));
  } finally { await pool.end(); }
}
main().catch(e => { console.error(e.message); process.exit(1); });
