"use client";

import { BASE_LAYERS, BaseLayerId } from "@/lib/mapStyles";

interface Props {
  active: BaseLayerId;
  onChange: (id: BaseLayerId) => void;
}

export default function LayerPicker({ active, onChange }: Props) {
  return (
    <div className="absolute bottom-8 left-3 z-10 rounded-xl bg-slate-900/85 p-1.5 shadow-lg shadow-black/40 backdrop-blur">
      <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        Base layer
      </p>
      <div className="flex flex-col gap-1">
        {BASE_LAYERS.map((layer) => (
          <button
            key={layer.id}
            onClick={() => onChange(layer.id)}
            title={layer.description}
            className={`rounded-lg px-3 py-1.5 text-left text-sm font-medium transition-colors ${
              active === layer.id
                ? "bg-orange-600 text-white"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            {layer.label}
          </button>
        ))}
      </div>
    </div>
  );
}
