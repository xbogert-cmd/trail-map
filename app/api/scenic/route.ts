import { NextResponse } from "next/server";

// All curated scenic roads as one GeoJSON FeatureCollection.
// There are only ~9, so the map loads them once at startup.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/scenic_roads_geojson`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!res.ok) {
    console.error("scenic fetch failed:", res.status, await res.text());
    return NextResponse.json({ error: "scenic fetch failed" }, { status: 502 });
  }
  return NextResponse.json(await res.json(), {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=86400" },
  });
}
