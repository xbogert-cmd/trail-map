import { NextRequest, NextResponse } from "next/server";

// Returns trails in the requested bbox as GeoJSON by calling the
// trails_in_bbox() Postgres function through Supabase's REST API.
// The database trims detail at low zoom, so responses stay small.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const bbox = (p.get("bbox") ?? "").split(",").map(Number);
  const zoom = Math.round(Number(p.get("zoom") ?? 8));

  if (bbox.length !== 4 || bbox.some(Number.isNaN)) {
    return NextResponse.json(
      { error: "expected bbox=minLon,minLat,maxLon,maxLat" },
      { status: 400 }
    );
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/trails_in_bbox`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      min_lon: bbox[0],
      min_lat: bbox[1],
      max_lon: bbox[2],
      max_lat: bbox[3],
      zoom,
    }),
  });

  if (!res.ok) {
    console.error("trails_in_bbox failed:", res.status, await res.text());
    return NextResponse.json({ error: "database query failed" }, { status: 502 });
  }

  const geojson = await res.json();
  return NextResponse.json(geojson, {
    headers: {
      // Browsers/CDN may cache a viewport briefly; trail data changes rarely
      "Cache-Control": "public, max-age=60, s-maxage=3600",
    },
  });
}
