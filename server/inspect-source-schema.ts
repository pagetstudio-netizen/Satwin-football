import pg from "pg";
const { Pool } = pg;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const table of ["users", "withdrawals"]) {
      const res = await pool.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`,
        [table]
      );
      console.log(`\n=== ${table} ===`);
      res.rows.forEach((r: any) => console.log(` ${r.column_name}: ${r.data_type}`));
    }
  } finally {
    await pool.end();
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
