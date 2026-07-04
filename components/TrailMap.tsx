"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { surfaceColorExpression, KNOWN_SURFACES, SURFACE_BUCKET } from "@/lib/trailStyle";
import LayerPicker from "./LayerPicker";
import TerrainToggle from "./TerrainToggle";
import Legend from "./Legend";
import MissingKeyNotice from "./MissingKeyNotice";
import TrailDetailPanel from "./TrailDetailPanel";
import SearchBar, { SearchHit } from "./SearchBar";
import FiltersPanel, { Filters, DEFAULT_FILTERS } from "./FiltersPanel";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";
const TRAILS_SOURCE = "trails";
const SCENIC_SOURCE = "scenic";
const TRAIL_LAYERS = ["trails-known", "trails-unknown"];
const SCENIC_LAYERS = ["scenic-glow", "scenic-line"];
const CLICKABLE_LAYERS = [...TRAIL_LAYERS, ...SCENIC_LAYERS];

function hasValidKey() {
  return MAPTILER_KEY.length > 0 && !MAPTILER_KEY.includes("YOUR_KEY");
}

type Selection = { id: string; kind: "trail" | "scenic" } | null;

export default function TrailMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const terrainOnRef = useRef(false);
  const trailsDataRef = useRef<GeoJSON.GeoJSON | null>(null);
  const scenicDataRef = useRef<GeoJSON.GeoJSON | null>(null);
  const filtersRef = useRef<Filters>(DEFAULT_FILTERS);
  const fetchAbortRef = useRef<AbortController | null>(null);

  const [baseLayer, setBaseLayer] = useState<BaseLayerId>("topo");
  const [terrainOn, setTerrainOn] = useState(false);
  const [selected, setSelected] = useState<Selection>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [keyMissing] = useState(() => !hasValidKey());

  // ---- filter expressions -------------------------------------------------
  const applyFilters = useCallback((map: maplibregl.Map) => {
    const f = filtersRef.current;
    if (!map.getLayer("trails-known")) return;

    const showTrails = f.show !== "scenic";
    const showScenic = f.show !== "offroad";
    for (const id of TRAIL_LAYERS) {
      map.setLayoutProperty(id, "visibility", showTrails ? "visible" : "none");
    }
    for (const id of SCENIC_LAYERS) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", showScenic ? "visible" : "none");
      }
    }

    const conds: unknown[] = [];
    // surface buckets
    if (f.surfaces.size < 5) {
      const allowedRaw = Object.entries(SURFACE_BUCKET)
        .filter(([, bucket]) => f.surfaces.has(bucket))
        .map(([raw]) => raw);
      const surfCond: unknown[] = ["any"];
      if (allowedRaw.length) {
        surfCond.push(["in", ["get", "surface"], ["literal", allowedRaw]]);
      }
      if (f.surfaces.has("unknown")) {
        surfCond.push(["!", ["in", ["get", "surface"], ["literal", KNOWN_SURFACES]]]);
      }
      conds.push(surfCond.length > 1 ? surfCond : ["==", 1, 2]); // nothing allowed
    }
    // difficulty range (null difficulty -> -1)
    if (f.minDifficulty > 1 || f.maxDifficulty < 5 || !f.includeUnrated) {
      const d = ["coalesce", ["get", "difficulty"], -1];
      const rated: unknown[] = ["all", [">=", d, f.minDifficulty], ["<=", d, f.maxDifficulty]];
      conds.push(f.includeUnrated ? ["any", ["==", d, -1], rated] : rated);
    }
    // min length
    if (f.minLengthMi > 0) {
      conds.push([">=", ["coalesce", ["get", "length_mi"], 0], f.minLengthMi]);
    }

    const knownBase = ["in", ["get", "surface"], ["literal", KNOWN_SURFACES]];
    const unknownBase = ["!", knownBase];
    map.setFilter(
      "trails-known",
      (conds.length ? ["all", knownBase, ...conds] : knownBase) as never
    );
    map.setFilter(
      "trails-unknown",
      (conds.length ? ["all", unknownBase, ...conds] : unknownBase) as never
    );
  }, []);

  function handleFiltersChange(f: Filters) {
    setFilters(f);
    filtersRef.current = f;
    if (mapRef.current) applyFilters(mapRef.current);
  }

  // ---- map setup ----------------------------------------------------------
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
        trailsDataRef.current = geojson;
        (map.getSource(TRAILS_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(geojson);
      } catch {
        /* aborted or offline */
      }
    }

    async function loadScenic() {
      if (scenicDataRef.current) return;
      try {
        const res = await fetch("/api/scenic");
        if (!res.ok) return;
        scenicDataRef.current = await res.json();
        (map.getSource(SCENIC_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(
          scenicDataRef.current as GeoJSON.GeoJSON
        );
      } catch {
        /* offline */
      }
    }

    function addLayers() {
      if (map.getSource(TRAILS_SOURCE)) return;

      map.addSource(TRAILS_SOURCE, {
        type: "geojson",
        data: trailsDataRef.current ?? { type: "FeatureCollection", features: [] },
      });
      map.addSource(SCENIC_SOURCE, {
        type: "geojson",
        data: scenicDataRef.current ?? { type: "FeatureCollection", features: [] },
      });

      const opacity = ["case", ["==", ["get", "source"], "mvum"], 0.95, 0.55] as unknown as number;
      const width = ["interpolate", ["linear"], ["zoom"], 7, 1, 11, 2, 14, 3.5] as unknown as number;

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

      // Scenic drives: soft red glow under a bright core line
      map.addLayer({
        id: "scenic-glow",
        type: "line",
        source: SCENIC_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#ef4444",
          "line-width": ["interpolate", ["linear"], ["zoom"], 7, 6, 12, 12] as unknown as number,
          "line-opacity": 0.3,
          "line-blur": 4,
        },
      });
      map.addLayer({
        id: "scenic-line",
        type: "line",
        source: SCENIC_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#f87171",
          "line-width": ["interpolate", ["linear"], ["zoom"], 7, 2, 12, 3.5] as unknown as number,
          "line-opacity": 0.95,
        },
      });

      applyFilters(map);
    }

    map.on("load", () => {
      addLayers();
      loadTrails();
      loadScenic();
    });
    map.on("moveend", loadTrails);
    map.on("style.load", () => {
      if (terrainOnRef.current) applyTerrain(map, true);
      addLayers();
    });

    map.on("click", CLICKABLE_LAYERS, (e) => {
      const f = e.features?.[0];
      if (!f?.properties?.id) return;
      const kind = SCENIC_LAYERS.includes(f.layer.id) ? "scenic" : "trail";
      setSelected({ id: String(f.properties.id), kind });
    });
    map.on("mouseenter", CLICKABLE_LAYERS, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", CLICKABLE_LAYERS, () => {
      map.getCanvas().style.cursor = "";
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function handleSearchPick(hit: SearchHit) {
    const map = mapRef.current;
    if (!map) return;
    const [minX, minY, maxX, maxY] = hit.bbox;
    map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 100, maxZoom: 14, duration: 1500 });
    setSelected({ id: hit.id, kind: hit.kind });
  }

  if (keyMissing) return <MissingKeyNotice />;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-slate-950">
      {/* h-full/w-full (not just inset-0) because MapLibre's stylesheet
          forces this element to position:relative, defeating inset sizing */}
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute left-3 top-3 z-10 select-none rounded-xl bg-slate-900/85 px-4 py-2 shadow-lg shadow-black/40 backdrop-blur max-sm:hidden">
        <span className="text-lg font-bold tracking-tight text-slate-100">
          Trail<span className="text-orange-500">Map</span>
        </span>
      </div>

      <SearchBar onPick={handleSearchPick} />
      <FiltersPanel filters={filters} onChange={handleFiltersChange} />
      <LayerPicker active={baseLayer} onChange={handleBaseLayerChange} />
      <Legend />
      <TerrainToggle active={terrainOn} onToggle={handleTerrainToggle} />

      {selected && (
        <TrailDetailPanel
          trailId={selected.id}
          kind={selected.kind}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
