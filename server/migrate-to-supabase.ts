import pg from "pg";

const { Pool } = pg;

const SOURCE_URL = process.env.DATABASE_URL;
const DEST_URL = process.env.SUPABASE_DATABASE_URL;

if (!SOURCE_URL || !DEST_URL) {
  console.error("DATABASE_URL and SUPABASE_DATABASE_URL must be set");
  process.exit(1);
}

const sourcePool = new Pool({ connectionString: SOURCE_URL });
const destPool = new Pool({ connectionString: DEST_URL });

async function migrateTable(tableName: string) {
  console.log(`Migrating ${tableName}...`);
  
  try {
    const sourceResult = await sourcePool.query(`SELECT * FROM ${tableName}`);
    const rows = sourceResult.rows;
    
    if (rows.length === 0) {
      console.log(`  ${tableName}: 0 rows (skipped)`);
      return;
    }

    await destPool.query(`DELETE FROM ${tableName}`);

    const columns = Object.keys(rows[0]);
    let migrated = 0;
    
    for (const row of rows) {
      const values = columns.map(col => row[col]);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      const columnNames = columns.map(c => `"${c}"`).join(', ');
      
      try {
        await destPool.query(
          `INSERT INTO ${tableName} (${columnNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          values
        );
        migrated++;
      } catch (e: any) {
        console.log(`  Error inserting row: ${e.message}`);
      }
    }

    if (columns.includes('id')) {
      try {
        await destPool.query(
          `SELECT setval(pg_get_serial_sequence('${tableName}', 'id'), COALESCE((SELECT MAX(id) FROM ${tableName}), 1), true)`
        );
      } catch (e) {
      }
    }
    
    console.log(`  ${tableName}: ${migrated}/${rows.length} rows migrated`);
  } catch (err: any) {
    console.log(`  ${tableName}: ERROR - ${err.message}`);
  }
}

async function migrate() {
  console.log("Starting migration from Replit Production to Supabase...\n");
  
  const tables = [
    'users',
    'products',
    'user_products',
    'deposits',
    'withdrawals',
    'withdrawal_wallets',
    'payment_channels',
    'tasks',
    'user_tasks',
    'transactions',
    'platform_settings',
    'gift_codes'
  ];
  
  for (const table of tables) {
    await migrateTable(table);
  }
  
  console.log("\nMigration completed!");
  
  const userCount = await destPool.query("SELECT COUNT(*) FROM users");
  const depositCount = await destPool.query("SELECT COUNT(*) FROM deposits");
  const transactionCount = await destPool.query("SELECT COUNT(*) FROM transactions");
  
  console.log(`\nVerification:`);
  console.log(`  Users: ${userCount.rows[0].count}`);
  console.log(`  Deposits: ${depositCount.rows[0].count}`);
  console.log(`  Transactions: ${transactionCount.rows[0].count}`);
  
  await sourcePool.end();
  await destPool.end();
}

migrate().catch(console.error);
