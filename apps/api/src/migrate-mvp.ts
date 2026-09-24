import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Pool } from "pg";

// Simple iBeacon MVP has its own schema (migrations 005 onward).
// Do not create the legacy Wi-Fi/provisioning/Entra tables on a clean MVP database.
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const migrationDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");
const client = await pool.connect();
try {
  // Serialize concurrent migration invocations on the same database.
  await client.query("SELECT pg_advisory_lock(hashtext('hvl_info_migrations'))");
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const files = (await readdir(migrationDir)).filter(name => {
    const match = /^(\d+)_.*\.sql$/.exec(name);
    return match !== null && Number(match[1]) >= 5;
  }).sort();
  for (const file of files) {
    await client.query("BEGIN");
    try {
      const alreadyApplied = await client.query(
        "SELECT 1 FROM schema_migrations WHERE filename=$1", [file]
      );
      if (!alreadyApplied.rowCount) {
        await client.query(await readFile(join(migrationDir, file), "utf8"));
        await client.query("INSERT INTO schema_migrations(filename) VALUES($1)", [file]);
        console.log("Applied", file);
      } else {
        console.log("Already applied", file);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  try { await client.query("SELECT pg_advisory_unlock(hashtext('hvl_info_migrations'))"); }
  finally { client.release(); await pool.end(); }
}
