"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  BASE_LAYERS,
  BaseLayerId,
  INITIAL_VIEW,
  TERRAIN_EXAGGERATION,
  TERRAIN_SOURCE_ID,
  terrainSourceUrl,
} from "@/lib/mapStyles";
import {
  surfaceColorExpression,
  KNOWN_SURFACES,
  difficultyColor,
  difficultyLabel,
} from "@/lib/trailStyle";
import LayerPicker from "./LayerPicker";
import TerrainToggle from "./TerrainToggle";
import Legend from "./Legend";
import MissingKeyNotice from "./MissingKeyNotice";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";
const TRAILS_SOURCE = "trails";
const TRAIL_LAYERS = ["trails-known", "trails-unknown"];

function hasValidKey() {
  return MAPTILER_KEY.length > 0 && !MAPTILER_KEY.includes("YOUR_KEY");
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function popupHtml(p: Record<string, unknown>): string {
  const name = p.name ? escapeHtml(String(p.name)) : "Unnamed route";
  const diff = p.difficulty != null ? Number(p.difficulty) : null;
  const chips: string[] = [];

  if (diff != null) {
    chips.push(
      `<span class="tm-chip" style="background:${difficultyColor(diff)};color:#111">
         ${diff} · ${escapeHtml(difficultyLabel(diff).split(" — ")[0])}</span>`
    );
  } else {
    chips.push(`<span class="tm-chip tm-chip-muted">Not rated</span>`);
  }
  if (p.surface) chips.push(`<span class="tm-chip tm-chip-muted">${escapeHtml(String(p.surface))}</span>`);
  if (p.length_mi != null) chips.push(`<span class="tm-chip tm-chip-muted">${p.length_mi} mi</span>`);
  if (p.source === "mvum") chips.push(`<span class="tm-chip tm-chip-green">USFS legal route</span>`);
  else chips.push(`<span class="tm-chip tm-chip-muted">OSM — verify access</span>`);
  if (p.seasonal === "seasonal") chips.push(`<span class="tm-chip tm-chip-amber">Seasonal</span>`);
  if (p.permit_required === true || p.permit_required === "true")
    chips.push(`<span class="tm-chip tm-chip-red">NPS permit required</span>`);

  return `
    <div class="tm-popup">
      <p class="tm-popup-title">${name}</p>
      <div class="tm-popup-chips">${chips.join("")}</div>
      <p class="tm-popup-note">Estimated difficulty from map data — conditions change, verify locally.</p>
    </div>`;
}

export default function TrailMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const terrainOnRef = useRef(false);
  const lastDataRef = useRef<GeoJSON.GeoJSON | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);

  const [baseLayer, setBaseLayer] = useState<BaseLayerId>("topo");
  const [terrainOn, setTerrainOn] = useState(false);
  const [keyMissing] = useState(() => !hasValidKey());

  useEffect(() => {
    if (keyMissing || !containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_LAYERS[0].styleUrl(MAPTILER_KEY),
      center: INITIAL_VIEW.center,
      zoom: INITIAL_VIEW.zoom,
      maxPitch: 75,
      attributionControl: { compact: true },
      // Lets tests read pixels off the canvas; disabled in production builds
      canvasContextAttributes: {
        preserveDrawingBuffer: process.env.NODE_ENV !== "production",
      },
    });
    mapRef.current = map;
    if (process.env.NODE_ENV !== "production") {
      // dev-only handle for debugging/tests
      (window as unknown as Record<string, unknown>).__map = map;
    }

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "top-right"
    );
    map.addControl(new maplibregl.FullscreenControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-left");

    async function loadTrails() {
      const b = map.getBounds();
      const url =
        `/api/trails?bbox=${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}` +
        `&zoom=${Math.round(map.getZoom())}`;
      fetchAbortRef.current?.abort();
      const ac = new AbortController();
      fetchAbortRef.current = ac;
      try {
        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) return;
        const geojson = await res.json();
        lastDataRef.current = geojson;
        const src = map.getSource(TRAILS_SOURCE) as maplibregl.GeoJSONSource | undefined;
        if (src) src.setData(geojson);
      } catch {
        // aborted or offline — keep whatever is on screen
      }
    }

    function addTrailLayers() {
      if (map.getSource(TRAILS_SOURCE)) return;
      map.addSource(TRAILS_SOURCE, {
        type: "geojson",
        data: lastDataRef.current ?? { type: "FeatureCollection", features: [] },
      });
      const opacity = [
        "case",
        ["==", ["get", "source"], "mvum"],
        0.95,
        0.55,
      ] as unknown as number;
      const width = [
        "interpolate", ["linear"], ["zoom"],
        7, 1, 11, 2, 14, 3.5,
      ] as unknown as number;

      // Known surfaces: solid colored lines
      map.addLayer({
        id: "trails-known",
        type: "line",
        source: TRAILS_SOURCE,
        filter: ["in", ["get", "surface"], ["literal", KNOWN_SURFACES]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": surfaceColorExpression,
          "line-opacity": opacity,
          "line-width": width,
        },
      });
      // Unknown surface: purple dashed
      map.addLayer({
        id: "trails-unknown",
        type: "line",
        source: TRAILS_SOURCE,
        filter: ["!", ["in", ["get", "surface"], ["literal", KNOWN_SURFACES]]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": surfaceColorExpression,
          "line-opacity": opacity,
          "line-width": width,
          "line-dasharray": [2, 2],
        },
      });
    }

    map.on("load", () => {
      addTrailLayers();
      loadTrails();
    });
    map.on("moveend", loadTrails);

    // Style switches wipe sources/layers: restore terrain AND trails
    map.on("style.load", () => {
      if (terrainOnRef.current) applyTerrain(map, true);
      addTrailLayers();
    });

    map.on("click", TRAIL_LAYERS, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      new maplibregl.Popup({ closeButton: true, maxWidth: "320px" })
        .setLngLat(e.lngLat)
        .setHTML(popupHtml(f.properties ?? {}))
        .addTo(map);
    });
    map.on("mouseenter", TRAIL_LAYERS, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", TRAIL_LAYERS, () => {
      map.getCanvas().style.cursor = "";
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [keyMissing]);

  function applyTerrain(map: maplibregl.Map, on: boolean) {
    if (on) {
      if (!map.getSource(TERRAIN_SOURCE_ID)) {
        map.addSource(TERRAIN_SOURCE_ID, {
          type: "raster-dem",
          url: terrainSourceUrl(MAPTILER_KEY),
        });
      }
      map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: TERRAIN_EXAGGERATION });
    } else {
      map.setTerrain(null);
    }
  }

  function handleBaseLayerChange(id: BaseLayerId) {
    setBaseLayer(id);
    const map = mapRef.current;
    if (!map) return;
    const layer = BASE_LAYERS.find((l) => l.id === id);
    if (layer) map.setStyle(layer.styleUrl(MAPTILER_KEY));
  }

  function handleTerrainToggle() {
    const map = mapRef.current;
    if (!map) return;
    const next = !terrainOnRef.current;
    terrainOnRef.current = next;
    setTerrainOn(next);
    applyTerrain(map, next);
    map.easeTo({
      pitch: next ? 60 : 0,
      bearing: next ? map.getBearing() : 0,
      duration: 1200,
    });
  }

  if (keyMissing) return <MissingKeyNotice />;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-slate-950">
      {/* h-full/w-full (not just inset-0) because MapLibre's stylesheet
          forces this element to position:relative, defeating inset sizing */}
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute left-3 top-3 z-10 select-none rounded-xl bg-slate-900/85 px-4 py-2 shadow-lg shadow-black/40 backdrop-blur">
        <span className="text-lg font-bold tracking-tight text-slate-100">
          Trail<span className="text-orange-500">Map</span>
        </span>
      </div>

      <LayerPicker active={baseLayer} onChange={handleBaseLayerChange} />
      <Legend />
      <TerrainToggle active={terrainOn} onToggle={handleTerrainToggle} />
    </div>
  );
}
