import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const migrationDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");
const client = await pool.connect();
try {
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  for (const filename of (await readdir(migrationDir)).filter(f => /^\d+.*\.sql$/.test(f)).sort()) {
    await client.query("BEGIN");
    try {
      const present = await client.query("SELECT 1 FROM schema_migrations WHERE filename = $1", [filename]);
      if (!present.rowCount) {
        await client.query(await readFile(join(migrationDir, filename), "utf8"));
        await client.query("INSERT INTO schema_migrations(filename) VALUES ($1)", [filename]);
        console.log("Applied", filename);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  client.release();
  await pool.end();
}
