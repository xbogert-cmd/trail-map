"use client";

import { useEffect, useRef, useState } from "react";
import { difficultyColor } from "@/lib/trailStyle";

export interface SearchHit {
  kind: "trail" | "scenic";
  id: string;
  name: string;
  nickname?: string;
  surface?: string | null;
  difficulty?: number | null;
  length_mi?: number | null;
  center: [number, number];
  bbox: [number, number, number, number];
}

export default function SearchBar({ onPick }: { onPick: (hit: SearchHit) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
        if (res.ok) {
          setHits(await res.json());
          setOpen(true);
        }
      } catch {
        /* offline — ignore */
      }
    }, 250);
    return () => clearTimeout(timer.current);
  }, [q]);

  return (
    <div className="absolute left-1/2 top-3 z-10 w-[min(420px,calc(100vw-11rem))] -translate-x-1/2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="Search trails &amp; scenic drives…"
        className="w-full rounded-xl bg-slate-900/85 px-4 py-2.5 text-sm text-slate-100 shadow-lg shadow-black/40 outline-none backdrop-blur placeholder:text-slate-500 focus:ring-2 focus:ring-orange-600"
      />
      {open && hits.length > 0 && (
        <ul className="mt-1.5 max-h-80 overflow-y-auto rounded-xl bg-slate-900/95 py-1 shadow-lg shadow-black/50 backdrop-blur">
          {hits.map((h) => (
            <li key={`${h.kind}-${h.id}`}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOpen(false);
                  setQ(h.name);
                  onPick(h);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-800"
              >
                {h.kind === "scenic" ? (
                  <span className="h-4 w-4 shrink-0 rounded-full bg-red-600 text-center text-[10px] font-bold leading-4 text-white">S</span>
                ) : h.difficulty != null ? (
                  <span
                    className="h-4 w-4 shrink-0 rounded-full text-center text-[10px] font-bold leading-4 text-black"
                    style={{ backgroundColor: difficultyColor(Number(h.difficulty)) }}
                  >
                    {Math.round(Number(h.difficulty))}
                  </span>
                ) : (
                  <span className="h-4 w-4 shrink-0 rounded-full bg-slate-600" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-100">{h.name}</span>
                  <span className="block text-xs text-slate-400">
                    {h.kind === "scenic"
                      ? `Scenic drive${h.nickname ? ` · ${h.nickname}` : ""}`
                      : [h.surface, h.length_mi != null ? `${h.length_mi} mi` : null]
                          .filter(Boolean)
                          .join(" · ") || "trail"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
