"use client";

type PracticeViewToggleProps = {
  viewMode: "text" | "avatar";
  visualEnabled: boolean;
  onChange: (mode: "text" | "avatar") => void;
};

export function PracticeViewToggle({ viewMode, visualEnabled, onChange }: PracticeViewToggleProps) {
  if (!visualEnabled) {
    return null;
  }

  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-sm">
      <button
        type="button"
        onClick={() => onChange("text")}
        className={`rounded px-3 py-1.5 font-medium transition-colors ${
          viewMode === "text"
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-600 hover:text-slate-900"
        }`}
        aria-pressed={viewMode === "text"}
      >
        Text
      </button>
      <button
        type="button"
        onClick={() => onChange("avatar")}
        className={`rounded px-3 py-1.5 font-medium transition-colors ${
          viewMode === "avatar"
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-600 hover:text-slate-900"
        }`}
        aria-pressed={viewMode === "avatar"}
      >
        Avatar
      </button>
    </div>
  );
}
