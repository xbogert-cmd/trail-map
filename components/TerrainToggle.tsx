"use client";

interface Props {
  active: boolean;
  onToggle: () => void;
}

export default function TerrainToggle({ active, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      title={
        active
          ? "Return to flat 2D view"
          : "Enable 3D terrain (right-click drag to rotate & tilt)"
      }
      className={`absolute bottom-8 right-3 z-10 rounded-xl px-4 py-2.5 text-sm font-bold shadow-lg shadow-black/40 backdrop-blur transition-colors ${
        active
          ? "bg-orange-600 text-white hover:bg-orange-500"
          : "bg-slate-900/85 text-slate-200 hover:bg-slate-800"
      }`}
    >
      {active ? "2D" : "3D"} <span className="font-normal">terrain</span>
    </button>
  );
}
