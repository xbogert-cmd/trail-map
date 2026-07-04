import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import MiniTrailMap from "@/components/MiniTrailMap";
import ElevationChart from "@/components/ElevationChart";
import { difficultyColor, difficultyLabel } from "@/lib/trailStyle";
import { elevationProfile } from "@/lib/elevation.mjs";

// Shareable per-trail page: /trail/<id>?kind=trail|scenic

export const revalidate = 86400;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function getDetail(id: string, kind: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const fn = kind === "scenic" ? "scenic_detail" : "trail_detail";
  const arg = kind === "scenic" ? { road_id: id } : { trail_id: id };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(arg),
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;
  return res.json();
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params;
  const { kind } = await searchParams;
  const d = await getDetail(id, kind ?? "trail");
  if (!d) return { title: "Trail not found — TrailMap" };
  const bits = [
    d.surface,
    d.length_mi ? `${d.length_mi} mi` : null,
    d.difficulty ? `difficulty ${d.difficulty}/5` : null,
  ].filter(Boolean);
  return {
    title: `${d.name ?? "Unnamed route"} — TrailMap`,
    description: `${d.name ?? "Offroad route"}: ${bits.join(", ")}. Offroad trail map for NC and the southern Appalachians.`,
  };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-900 p-3 text-center">
      <p className="text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-slate-100">{value}</p>
    </div>
  );
}

export default async function TrailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { kind = "trail" } = await searchParams;
  const d = await getDetail(id, kind);
  if (!d) notFound();

  let profile = null;
  try {
    profile = await elevationProfile(d.geometry, 120, 12);
  } catch {
    /* chart hidden */
  }

  const diff = d.difficulty != null ? Number(d.difficulty) : null;
  const dest = d.start_point;

  return (
    // h-dvh + overflow-y-auto because the root layout clips <body> for the map
    <main className="h-dvh overflow-y-auto bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <Link href="/" className="text-sm text-orange-400 hover:text-orange-300">
          &larr; Back to the map
        </Link>

        <h1 className="mt-3 text-2xl font-bold">{d.name ?? "Unnamed route"}</h1>
        {d.nickname && <p className="text-orange-400">&ldquo;{d.nickname}&rdquo;</p>}

        <div className="mt-2 flex flex-wrap gap-1.5">
          {kind === "scenic" ? (
            <span className="rounded-full bg-red-900 px-2.5 py-0.5 text-xs font-semibold text-red-100">
              Scenic drive
            </span>
          ) : diff != null ? (
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-bold text-black"
              style={{ backgroundColor: difficultyColor(diff) }}
            >
              {diff} &middot; {difficultyLabel(diff)}
            </span>
          ) : (
            <span className="rounded-full bg-slate-700 px-2.5 py-0.5 text-xs font-semibold">
              Not rated
            </span>
          )}
          {kind === "trail" && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                d.source === "mvum" ? "bg-green-900 text-green-100" : "bg-slate-700 text-slate-200"
              }`}
            >
              {d.source === "mvum" ? "USFS legal route" : "OSM — verify access"}
            </span>
          )}
          {d.permit_required && (
            <span className="rounded-full bg-red-900 px-2.5 py-0.5 text-xs font-semibold text-red-100">
              NPS permit required
            </span>
          )}
        </div>

        {d.description && (
          <p className="mt-3 text-sm leading-relaxed text-slate-300">{d.description}</p>
        )}

        <div className="mt-4 h-72 overflow-hidden rounded-2xl">
          <MiniTrailMap geometry={d.geometry} color={kind === "scenic" ? "#f87171" : "#f97316"} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {d.length_mi != null && <Stat label="Length" value={`${d.length_mi} mi`} />}
          {d.surface && <Stat label="Surface" value={d.surface} />}
          {d.curve_count != null && <Stat label="Curves" value={String(d.curve_count)} />}
          {profile && <Stat label="Ascent" value={`${profile.ascentFt.toLocaleString()} ft`} />}
          {profile && <Stat label="Descent" value={`${profile.descentFt.toLocaleString()} ft`} />}
          {profile && <Stat label="Max elev" value={`${profile.maxFt.toLocaleString()} ft`} />}
          {d.seasonal && <Stat label="Season" value={d.seasonal} />}
        </div>

        {profile && (
          <div className="mt-4 rounded-2xl bg-slate-900 p-4">
            <p className="pb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Elevation profile
            </p>
            <ElevationChart profile={profile} />
          </div>
        )}

        {dest && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${dest[1]},${dest[0]}`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 block rounded-xl bg-orange-600 py-3 text-center font-bold text-white hover:bg-orange-500"
          >
            Directions to trailhead &#8599;
          </a>
        )}

        <p className="mt-6 text-xs leading-relaxed text-slate-500">
          Estimated difficulty is computed from map data (surface, track grade,
          smoothness, steepness). Trail conditions and legal access change
          &mdash; always verify locally.{" "}
          <Link href="/about" className="text-slate-400 underline">
            Data sources &amp; attribution
          </Link>
        </p>
      </div>
    </main>
  );
}
