"use client";

import { useState } from "react";
import { SURFACE_COLORS, DIFFICULTY_LABELS, difficultyColor } from "@/lib/trailStyle";

const SURFACE_ROWS: { key: keyof typeof SURFACE_COLORS; label: string; dashed?: boolean }[] = [
  { key: "asphalt", label: "Asphalt / paved" },
  { key: "gravel", label: "Gravel" },
  { key: "dirt", label: "Dirt / ground" },
  { key: "sand", label: "Sand" },
  { key: "unknown", label: "Unknown surface", dashed: true },
];

export default function Legend() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className={`absolute bottom-8 right-28 z-10 rounded-xl px-4 py-2.5 text-sm font-bold shadow-lg shadow-black/40 backdrop-blur transition-colors ${
          open
            ? "bg-orange-600 text-white hover:bg-orange-500"
            : "bg-slate-900/85 text-slate-200 hover:bg-slate-800"
        }`}
      >
        Legend
      </button>

      {open && (
        <div className="absolute bottom-24 right-3 z-10 w-72 max-h-[60vh] overflow-y-auto rounded-xl bg-slate-900/90 p-4 shadow-lg shadow-black/40 backdrop-blur">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Surface
          </p>
          <ul className="mt-2 space-y-1.5">
            {SURFACE_ROWS.map((row) => (
              <li key={row.key} className="flex items-center gap-2.5 text-sm text-slate-200">
                <span
                  className="h-1 w-8 shrink-0 rounded"
                  style={
                    row.dashed
                      ? {
                          backgroundImage: `repeating-linear-gradient(90deg, ${SURFACE_COLORS[row.key]} 0 6px, transparent 6px 10px)`,
                        }
                      : { backgroundColor: SURFACE_COLORS[row.key] }
                  }
                />
                {row.label}
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs text-slate-400">
            Solid lines are USFS MVUM-designated routes. Faded lines are from
            OpenStreetMap and may not be legally open — verify before riding.
          </p>

          <p className="mt-4 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Estimated difficulty
          </p>
          <ul className="mt-2 space-y-1.5">
            {Object.entries(DIFFICULTY_LABELS).map(([n, label]) => (
              <li key={n} className="flex items-center gap-2.5 text-sm text-slate-200">
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-black"
                  style={{ backgroundColor: difficultyColor(Number(n)) }}
                >
                  {n}
                </span>
                {label}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-400">
            Difficulty is estimated from map data. Conditions change — always
            verify locally.
          </p>
        </div>
      )}
    </>
  );
}
