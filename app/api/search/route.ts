import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json([]);

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/search_trails`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q, max_results: 20 }),
  });
  if (!res.ok) {
    console.error("search failed:", res.status, await res.text());
    return NextResponse.json({ error: "search failed" }, { status: 502 });
  }
  return NextResponse.json(await res.json(), {
    headers: { "Cache-Control": "public, max-age=60" },
  });
}
