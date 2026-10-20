
import "dotenv/config";
import pg from "pg";

const { Client } = pg;

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is missing");
  }

  const client = new Client({ connectionString });

  await client.connect();

  try {
    const result = await client.query(`
      SELECT
        id,
        action,
        success,
        "createdAt",
        "previousHash",
        "integrityHash"
      FROM "AuditLog"
      ORDER BY "createdAt" DESC, id DESC
      LIMIT 10
    `);

    console.table(result.rows);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
