
import "dotenv/config";
import pg from "pg";

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing.");
}

const client = new Client({ connectionString });

async function main() {
  await client.connect();

  try {
    await client.query("BEGIN");

    await client.query(`
      ALTER TABLE "AuditLog"
      ADD COLUMN IF NOT EXISTS "previousHash" TEXT,
      ADD COLUMN IF NOT EXISTS "integrityHash" TEXT
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "AuditLog_integrityHash_key"
      ON "AuditLog" ("integrityHash")
    `);

    await client.query("COMMIT");
    console.log("Audit hash-chain columns added successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exitCode = 1;
});
