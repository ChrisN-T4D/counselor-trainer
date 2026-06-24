"use client";

import { EKMAN_AXES } from "@/lib/affect/emotion";
import type { AffectDebug } from "@/components/practice/use-practice-voice";

// Dev-only spider/radar plot of the client's felt (outline) vs displayed (filled)
// emotion vectors, plus arousal/rapport. Enabled via NEXT_PUBLIC_AFFECT_DEBUG=1
// for tuning the expressivity profile + reaction tagging.

const SIZE = 180;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 24;

const SHORT_LABELS: Record<string, string> = {
  anger: "ang",
  disgust: "dis",
  fear: "fear",
  sadness: "sad",
  enjoyment: "joy",
  surprise: "surp",
  contempt: "cont",
};

function axisPoint(index: number, value: number): [number, number] {
  const angle = (Math.PI * 2 * index) / EKMAN_AXES.length - Math.PI / 2;
  const r = RADIUS * Math.max(0, Math.min(1, value));
  return [CENTER + Math.cos(angle) * r, CENTER + Math.sin(angle) * r];
}

function polygon(values: number[]): string {
  return values.map((v, i) => axisPoint(i, v).join(",")).join(" ");
}

export function AffectRadarOverlay({ data }: { data: AffectDebug }) {
  const felt = EKMAN_AXES.map((a) => data.felt[a] ?? 0);
  const displayed = EKMAN_AXES.map((a) => data.displayed[a] ?? 0);

  return (
    <div className="pointer-events-none fixed right-3 top-20 z-50 rounded-lg bg-slate-950/80 p-2 text-[10px] text-slate-200 shadow-lg backdrop-blur-sm">
      <div className="mb-1 flex items-center justify-between gap-3 font-mono uppercase tracking-wide">
        <span className="text-emerald-400">affect debug</span>
        <span>
          ar {Math.round(data.arousal * 100)} · rap {Math.round(data.rapport * 100)}
        </span>
      </div>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {[0.25, 0.5, 0.75, 1].map((ring) => (
          <polygon
            key={ring}
            points={polygon(EKMAN_AXES.map(() => ring))}
            fill="none"
            stroke="rgba(148,163,184,0.25)"
            strokeWidth={0.5}
          />
        ))}
        {EKMAN_AXES.map((axis, i) => {
          const [x, y] = axisPoint(i, 1.12);
          const [lx, ly] = axisPoint(i, 1);
          return (
            <g key={axis}>
              <line
                x1={CENTER}
                y1={CENTER}
                x2={lx}
                y2={ly}
                stroke="rgba(148,163,184,0.2)"
                strokeWidth={0.5}
              />
              <text x={x} y={y} fill="rgba(203,213,225,0.8)" fontSize={7} textAnchor="middle">
                {SHORT_LABELS[axis]}
              </text>
            </g>
          );
        })}
        <polygon
          points={polygon(felt)}
          fill="none"
          stroke="rgba(56,189,248,0.9)"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
        <polygon
          points={polygon(displayed)}
          fill="rgba(244,114,182,0.25)"
          stroke="rgba(244,114,182,0.9)"
          strokeWidth={1}
        />
      </svg>
      <div className="mt-1 flex items-center gap-3 font-mono">
        <span className="text-sky-400">— felt</span>
        <span className="text-pink-400">▰ shown</span>
      </div>
    </div>
  );
}
