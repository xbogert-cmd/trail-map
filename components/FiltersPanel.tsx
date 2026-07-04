"use client";

import { useState } from "react";
import { SURFACE_COLORS } from "@/lib/trailStyle";

export interface Filters {
  surfaces: Set<string>; // buckets: asphalt/gravel/dirt/sand/unknown
  minDifficulty: number;
  maxDifficulty: number;
  includeUnrated: boolean;
  minLengthMi: number;
  show: "offroad" | "scenic" | "both";
}

export const DEFAULT_FILTERS: Filters = {
  surfaces: new Set(["asphalt", "gravel", "dirt", "sand", "unknown"]),
  minDifficulty: 1,
  maxDifficulty: 5,
  includeUnrated: true,
  minLengthMi: 0,
  show: "both",
};

const SURFACE_OPTIONS: { key: string; label: string }[] = [
  { key: "dirt", label: "Dirt" },
  { key: "gravel", label: "Gravel" },
  { key: "sand", label: "Sand" },
  { key: "asphalt", label: "Asphalt" },
  { key: "unknown", label: "Unknown" },
];

export default function FiltersPanel({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const [open, setOpen] = useState(false);
  const active =
    filters.surfaces.size < 5 ||
    filters.minDifficulty > 1 ||
    filters.maxDifficulty < 5 ||
    !filters.includeUnrated ||
    filters.minLengthMi > 0 ||
    filters.show !== "both";

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className={`absolute right-3 top-3 z-10 rounded-xl px-4 py-2.5 text-sm font-bold shadow-lg shadow-black/40 backdrop-blur transition-colors max-sm:right-14 ${
          open || active
            ? "bg-orange-600 text-white hover:bg-orange-500"
            : "bg-slate-900/85 text-slate-200 hover:bg-slate-800"
        }`}
        style={{ marginRight: "3.2rem" }}
      >
        Filters{active ? " •" : ""}
      </button>

      {open && (
        <div className="absolute right-3 top-16 z-10 w-72 rounded-xl bg-slate-900/95 p-4 shadow-lg shadow-black/50 backdrop-blur">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Show</p>
          <div className="mt-1.5 flex gap-1">
            {(["offroad", "scenic", "both"] as const).map((v) => (
              <button
                key={v}
                onClick={() => onChange({ ...filters, show: v })}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold capitalize ${
                  filters.show === v
                    ? "bg-orange-600 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {v === "offroad" ? "Offroad" : v === "scenic" ? "Scenic" : "Both"}
              </button>
            ))}
          </div>

          <p className="mt-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Surface</p>
          <div className="mt-1.5 grid grid-cols-2 gap-1">
            {SURFACE_OPTIONS.map((s) => {
              const on = filters.surfaces.has(s.key);
              return (
                <button
                  key={s.key}
                  onClick={() => {
                    const next = new Set(filters.surfaces);
                    if (on) next.delete(s.key);
                    else next.add(s.key);
                    onChange({ ...filters, surfaces: next });
                  }}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium ${
                    on ? "bg-slate-700 text-white" : "bg-slate-800/60 text-slate-500"
                  }`}
                >
                  <span
                    className="h-2 w-5 rounded"
                    style={{ backgroundColor: SURFACE_COLORS[s.key], opacity: on ? 1 : 0.3 }}
                  />
                  {s.label}
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Difficulty {filters.minDifficulty}–{filters.maxDifficulty}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <select
              value={filters.minDifficulty}
              onChange={(e) =>
                onChange({
                  ...filters,
                  minDifficulty: +e.target.value,
                  maxDifficulty: Math.max(+e.target.value, filters.maxDifficulty),
                })
              }
              className="flex-1 rounded-lg bg-slate-800 px-2 py-1.5 text-xs text-slate-100"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>min {n}</option>
              ))}
            </select>
            <select
              value={filters.maxDifficulty}
              onChange={(e) =>
                onChange({
                  ...filters,
                  maxDifficulty: +e.target.value,
                  minDifficulty: Math.min(+e.target.value, filters.minDifficulty),
                })
              }
              className="flex-1 rounded-lg bg-slate-800 px-2 py-1.5 text-xs text-slate-100"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>max {n}</option>
              ))}
            </select>
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={filters.includeUnrated}
              onChange={(e) => onChange({ ...filters, includeUnrated: e.target.checked })}
              className="accent-orange-600"
            />
            Include unrated trails
          </label>

          <p className="mt-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Minimum length: {filters.minLengthMi} mi
          </p>
          <input
            type="range"
            min={0}
            max={10}
            step={0.5}
            value={filters.minLengthMi}
            onChange={(e) => onChange({ ...filters, minLengthMi: +e.target.value })}
            className="mt-1 w-full accent-orange-600"
          />

          <button
            onClick={() => onChange({ ...DEFAULT_FILTERS, surfaces: new Set(DEFAULT_FILTERS.surfaces) })}
            className="mt-3 w-full rounded-lg bg-slate-800 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
          >
            Reset filters
          </button>
        </div>
      )}
    </>
  );
}
