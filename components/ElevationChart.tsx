"use client";

import { useState } from "react";

export interface Profile {
  points: { mi: number; ft: number }[];
  ascentFt: number;
  descentFt: number;
  minFt: number;
  maxFt: number;
  lengthMi: number;
}

const W = 320;
const H = 110;
const PAD = { top: 8, right: 6, bottom: 18, left: 40 };

export default function ElevationChart({ profile }: { profile: Profile }) {
  const [hover, setHover] = useState<number | null>(null);

  const { points, minFt, maxFt } = profile;
  if (!points || points.length < 2) return null;

  const span = Math.max(maxFt - minFt, 50); // avoid a flat line filling the chart
  const totalMi = points[points.length - 1].mi || 1;
  const x = (mi: number) => PAD.left + (mi / totalMi) * (W - PAD.left - PAD.right);
  const y = (ft: number) =>
    PAD.top + (1 - (ft - minFt) / span) * (H - PAD.top - PAD.bottom);

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.mi).toFixed(1)},${y(p.ft).toFixed(1)}`).join("");
  const area = `${line}L${x(totalMi).toFixed(1)},${H - PAD.bottom}L${PAD.left},${H - PAD.bottom}Z`;

  const hoverPt = hover != null ? points[hover] : null;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mi = ((e.clientX - rect.left) / rect.width * W - PAD.left) /
      (W - PAD.left - PAD.right) * totalMi;
    let best = 0;
    let bestD = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(p.mi - mi);
      if (d < bestD) { bestD = d; best = i; }
    });
    setHover(best);
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full select-none"
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      {/* min/max gridlines */}
      {[minFt, maxFt].map((ft) => (
        <g key={ft}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(ft)} y2={y(ft)}
            stroke="#334155" strokeDasharray="3 3" strokeWidth="0.75" />
          <text x={PAD.left - 4} y={y(ft) + 3} textAnchor="end"
            fontSize="8" fill="#94a3b8">{ft.toLocaleString()}&#8242;</text>
        </g>
      ))}
      <path d={area} fill="#ea580c" fillOpacity="0.25" />
      <path d={line} fill="none" stroke="#f97316" strokeWidth="1.5" />
      {/* distance labels */}
      <text x={PAD.left} y={H - 6} fontSize="8" fill="#94a3b8">0 mi</text>
      <text x={W - PAD.right} y={H - 6} textAnchor="end" fontSize="8" fill="#94a3b8">
        {totalMi.toFixed(1)} mi
      </text>
      {hoverPt && (
        <g>
          <line x1={x(hoverPt.mi)} x2={x(hoverPt.mi)} y1={PAD.top} y2={H - PAD.bottom}
            stroke="#e2e8f0" strokeWidth="0.75" />
          <circle cx={x(hoverPt.mi)} cy={y(hoverPt.ft)} r="2.5" fill="#f97316" stroke="#fff" strokeWidth="1" />
          <text
            x={Math.min(Math.max(x(hoverPt.mi), PAD.left + 30), W - PAD.right - 30)}
            y={PAD.top + 8} textAnchor="middle" fontSize="9" fill="#f1f5f9" fontWeight="bold">
            {hoverPt.ft.toLocaleString()}&#8242; @ {hoverPt.mi.toFixed(1)} mi
          </text>
        </g>
      )}
    </svg>
  );
}
