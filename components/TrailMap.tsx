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
import LayerPicker from "./LayerPicker";
import TerrainToggle from "./TerrainToggle";
import MissingKeyNotice from "./MissingKeyNotice";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";

function hasValidKey() {
  return MAPTILER_KEY.length > 0 && !MAPTILER_KEY.includes("YOUR_KEY");
}

export default function TrailMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // Refs mirror state so map event handlers always see current values.
  const terrainOnRef = useRef(false);

  const [baseLayer, setBaseLayer] = useState<BaseLayerId>("topo");
  const [terrainOn, setTerrainOn] = useState(false);
  const [keyMissing] = useState(() => !hasValidKey());

  // Create the map once.
  useEffect(() => {
    if (keyMissing || !containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_LAYERS[0].styleUrl(MAPTILER_KEY),
      center: INITIAL_VIEW.center,
      zoom: INITIAL_VIEW.zoom,
      maxPitch: 75,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      "top-right"
    );
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "top-right"
    );
    map.addControl(new maplibregl.FullscreenControl(), "top-right");
    map.addControl(
      new maplibregl.ScaleControl({ unit: "imperial" }),
      "bottom-left"
    );

    // Switching base styles wipes all sources, so terrain must be
    // re-attached every time a new style finishes loading.
    map.on("style.load", () => {
      if (terrainOnRef.current) applyTerrain(map, true);
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
      map.setTerrain({
        source: TERRAIN_SOURCE_ID,
        exaggeration: TERRAIN_EXAGGERATION,
      });
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

      {/* Floating brand badge */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 select-none rounded-xl bg-slate-900/85 px-4 py-2 shadow-lg shadow-black/40 backdrop-blur">
        <span className="text-lg font-bold tracking-tight text-slate-100">
          Trail<span className="text-orange-500">Map</span>
        </span>
      </div>

      <LayerPicker active={baseLayer} onChange={handleBaseLayerChange} />
      <TerrainToggle active={terrainOn} onToggle={handleTerrainToggle} />
    </div>
  );
}
