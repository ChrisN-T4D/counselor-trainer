"use client";

import type { PracticeViewMode } from "@/lib/visual/types";

type PracticeViewToggleProps = {
  viewMode: PracticeViewMode;
  visualEnabled: boolean;
  onChange: (mode: PracticeViewMode) => void;
};

const MODES: Array<{ id: PracticeViewMode; label: string }> = [
  { id: "text", label: "Text" },
  { id: "avatar", label: "Avatar" },
  { id: "room", label: "Room (3D)" },
];

export function PracticeViewToggle({ viewMode, visualEnabled, onChange }: PracticeViewToggleProps) {
  if (!visualEnabled) {
    return null;
  }

  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-sm">
      {MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          onClick={() => onChange(mode.id)}
          className={`rounded px-3 py-1.5 font-medium transition-colors ${
            viewMode === mode.id
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
          aria-pressed={viewMode === mode.id}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
