import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error(
    "SUPABASE_DB_URL is not set in .env.local.\n" +
      "In Supabase: click 'Connect' (top bar) -> 'Session pooler' -> copy the URI\n" +
      "and replace [YOUR-PASSWORD] with your database password."
  );
  process.exit(1);
}

export const pool = new pg.Pool({
  connectionString: url,
  max: 4,
  // Supabase requires TLS; their pooler uses a cert Node doesn't know by default
  ssl: { rejectUnauthorized: false },
});

export async function query(text, params) {
  return pool.query(text, params);
}
