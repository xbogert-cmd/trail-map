"use client";

import { useEffect, useState } from "react";
import ElevationChart, { Profile } from "./ElevationChart";
import { difficultyColor, difficultyLabel } from "@/lib/trailStyle";

export interface TrailDetail {
  kind: "trail" | "scenic";
  id: string;
  name: string | null;
  nickname?: string | null;
  description?: string | null;
  curve_count?: number | null;
  source?: string;
  route_id?: string | null;
  highway?: string | null;
  surface?: string | null;
  tracktype?: string | null;
  smoothness?: string | null;
  fourwd_only?: boolean;
  vehicle_classes?: Record<string, boolean> | null;
  seasonal?: string | null;
  season_dates?: Record<string, string | null> | null;
  permit_required?: boolean;
  length_mi?: number | null;
  difficulty?: number | null;
  difficulty_inputs?: { avg_grade_pct?: number | null } | null;
  start_point?: [number, number];
  end_point?: [number, number];
  profile?: Profile | null;
}

const VEHICLE_LABELS: Record<string, string> = {
  highway_legal: "Highway-legal vehicles",
  high_clearance: "High-clearance vehicles",
  lt50: "OHVs under 50″",
  atv: "ATVs",
  motorcycle: "Motorcycles",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-800 py-1.5 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="text-right text-slate-100">{value}</span>
    </div>
  );
}

export default function TrailDetailPanel({
  trailId,
  kind,
  onClose,
}: {
  trailId: string;
  kind: "trail" | "scenic";
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<TrailDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setDetail(null);
    setError(false);
    const ac = new AbortController();
    fetch(`/api/trail/${trailId}?kind=${kind}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setDetail)
      .catch(() => !ac.signal.aborted && setError(true));
    return () => ac.abort();
  }, [trailId, kind]);

  const d = detail;
  const diff = d?.difficulty != null ? Number(d.difficulty) : null;
  const allowed = d?.vehicle_classes
    ? Object.entries(d.vehicle_classes).filter(([, v]) => v).map(([k]) => VEHICLE_LABELS[k] ?? k)
    : [];
  const dest = d?.start_point;
  const gmaps = dest
    ? `https://www.google.com/maps/dir/?api=1&destination=${dest[1]},${dest[0]}`
    : null;

  return (
    <div
      className="absolute z-20 flex flex-col overflow-hidden bg-slate-900/95 shadow-2xl shadow-black/60 backdrop-blur
                 max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[55dvh] max-sm:rounded-t-2xl
                 sm:left-3 sm:top-16 sm:bottom-8 sm:w-96 sm:rounded-2xl"
    >
      <div className="flex items-start justify-between gap-2 p-4 pb-2">
        <div>
          <h2 className="text-lg font-bold leading-tight text-slate-100">
            {d ? (d.name ?? "Unnamed route") : "Loading…"}
          </h2>
          {d?.nickname && <p className="text-sm text-orange-400">&ldquo;{d.nickname}&rdquo;</p>}
          {d?.kind === "trail" && d.route_id && (
            <p className="text-xs text-slate-400">Forest Route {d.route_id}</p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-lg px-2 py-0.5 text-xl leading-none text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          &times;
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {error && (
          <p className="py-6 text-sm text-slate-400">
            Couldn&apos;t load this trail. Check your connection and try again.
          </p>
        )}
        {!d && !error && (
          <div className="space-y-2 py-2">
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-800" />
            <div className="h-28 animate-pulse rounded bg-slate-800" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-slate-800" />
          </div>
        )}
        {d && (
          <>
            <div className="flex flex-wrap gap-1.5 pb-2">
              {d.kind === "scenic" ? (
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
                <span className="rounded-full bg-slate-700 px-2.5 py-0.5 text-xs font-semibold text-slate-200">
                  Not rated
                </span>
              )}
              {d.kind === "trail" && (
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
              <p className="pb-2 text-sm leading-relaxed text-slate-300">{d.description}</p>
            )}

            {d.profile ? (
              <div className="rounded-xl bg-slate-950/60 p-2">
                <ElevationChart profile={d.profile} />
                <div className="mt-1 grid grid-cols-4 gap-1 text-center">
                  {[
                    ["Ascent", `${d.profile.ascentFt.toLocaleString()} ft`],
                    ["Descent", `${d.profile.descentFt.toLocaleString()} ft`],
                    ["Min", `${d.profile.minFt.toLocaleString()} ft`],
                    ["Max", `${d.profile.maxFt.toLocaleString()} ft`],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">{k}</p>
                      <p className="text-xs font-semibold text-slate-100">{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="rounded-xl bg-slate-950/60 p-3 text-xs text-slate-500">
                Elevation profile unavailable right now.
              </p>
            )}

            <div className="mt-2">
              {d.length_mi != null && <Row label="Length" value={`${d.length_mi} mi`} />}
              {d.surface && <Row label="Surface" value={d.surface} />}
              {d.curve_count != null && (
                <Row label="Curves" value={d.curve_count.toLocaleString()} />
              )}
              {d.tracktype && <Row label="Track grade" value={d.tracktype} />}
              {d.smoothness && <Row label="Smoothness" value={d.smoothness} />}
              {d.difficulty_inputs?.avg_grade_pct != null && (
                <Row label="Avg grade" value={`${d.difficulty_inputs.avg_grade_pct}%`} />
              )}
              {d.fourwd_only && <Row label="4WD only" value="yes" />}
              {d.seasonal && <Row label="Season" value={d.seasonal} />}
              {allowed.length > 0 && (
                <Row label="Allowed" value={allowed.join(", ")} />
              )}
              {d.season_dates &&
                Object.entries(d.season_dates)
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <Row key={k} label={`${VEHICLE_LABELS[k] ?? k} dates`} value={v} />
                  ))}
            </div>

            {gmaps && (
              <a
                href={gmaps}
                target="_blank"
                rel="noreferrer"
                className="mt-3 block rounded-xl bg-orange-600 py-2.5 text-center text-sm font-bold text-white hover:bg-orange-500"
              >
                Directions to trailhead &#8599;
              </a>
            )}
            <a
              href={`/trail/${d.id}${d.kind === "scenic" ? "?kind=scenic" : ""}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block rounded-xl bg-slate-800 py-2 text-center text-xs font-semibold text-slate-200 hover:bg-slate-700"
            >
              Open shareable page
            </a>

            <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
              Estimated difficulty is computed from map data. Trail conditions
              and legal access change &mdash; verify locally before you go.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
