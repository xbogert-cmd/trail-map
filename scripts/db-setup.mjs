// Applies supabase/schema.sql to the database. Safe to run repeatedly.
import { readFileSync } from "node:fs";
import { pool } from "./lib/db.mjs";

const sql = readFileSync("supabase/schema.sql", "utf8");

try {
  await pool.query(sql);
  const { rows } = await pool.query(
    `select postgis_version() as postgis,
            pg_size_pretty(pg_database_size(current_database())) as db_size`
  );
  console.log("Schema applied.");
  console.log("PostGIS version:", rows[0].postgis);
  console.log("Database size:", rows[0].db_size);
} finally {
  await pool.end();
}
