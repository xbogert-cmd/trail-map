"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// Small non-interactive-ish map showing one trail, for /trail/[id] pages.
export default function MiniTrailMap({
  geometry,
  color = "#f97316",
}: {
  geometry: GeoJSON.Geometry;
  color?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";
    if (!ref.current || !key) return;

    const coords =
      geometry.type === "LineString"
        ? (geometry as GeoJSON.LineString).coordinates
        : (geometry as GeoJSON.MultiLineString).coordinates.flat();
    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ];

    const map = new maplibregl.Map({
      container: ref.current,
      style: `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${key}`,
      bounds,
      fitBoundsOptions: { padding: 40 },
      attributionControl: { compact: true },
      interactive: true,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.addSource("trail", {
        type: "geojson",
        data: { type: "Feature", geometry, properties: {} },
      });
      map.addLayer({
        id: "trail-casing",
        type: "line",
        source: "trail",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#0f172a", "line-width": 6, "line-opacity": 0.5 },
      });
      map.addLayer({
        id: "trail-line",
        type: "line",
        source: "trail",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": color, "line-width": 3.5 },
      });
    });
    return () => map.remove();
  }, [geometry, color]);

  return <div ref={ref} className="h-full w-full" />;
}
