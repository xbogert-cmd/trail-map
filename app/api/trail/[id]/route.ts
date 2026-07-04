import { NextRequest, NextResponse } from "next/server";
import { elevationProfile } from "@/lib/elevation.mjs";

// Full detail for one trail (or scenic road with ?kind=scenic), including
// an elevation profile sampled from public-domain terrain tiles.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function rpc(fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const kind = req.nextUrl.searchParams.get("kind") ?? "trail";
  if (!/^[0-9a-f-]{36}$/.test(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  try {
    const detail =
      kind === "scenic"
        ? await rpc("scenic_detail", { road_id: id })
        : await rpc("trail_detail", { trail_id: id });
    if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });

    let profile = null;
    try {
      profile = await elevationProfile(detail.geometry, 120, 12);
    } catch (err) {
      // Elevation service hiccup: panel still works, chart just doesn't show
      console.error("elevation profile failed:", err);
    }

    return NextResponse.json(
      { ...detail, kind, profile },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=86400" } }
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "lookup failed" }, { status: 502 });
  }
}
