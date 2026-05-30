"use client";

import { useState } from "react";
import {
  AUDIO_OUTPUT_MODE_DETAILS,
  type AudioOutputMode,
  type AudioOutputModeHint,
  getAudioOutputModeHintText,
  getAudioOutputModeLabel,
} from "@/lib/voice/audio-output-mode";

type ListeningModePanelProps = {
  value: AudioOutputMode;
  onChange: (mode: AudioOutputMode) => void;
  hint?: AudioOutputModeHint | null;
  defaultExpanded?: boolean;
};

export function ListeningModePanel({
  value,
  onChange,
  hint = null,
  defaultExpanded = false,
}: ListeningModePanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hintText = getAudioOutputModeHintText(hint);
  const active = AUDIO_OUTPUT_MODE_DETAILS[value];
  const inactiveMode = value === "headphones" ? "speakers" : "headphones";
  const inactive = AUDIO_OUTPUT_MODE_DETAILS[inactiveMode];

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50">
      <div className="flex flex-wrap items-start justify-between gap-3 p-3">
        <div>
          <p className="text-sm font-medium text-slate-900">Listening mode</p>
          <p className="mt-1 text-xs text-slate-600">
            Current:{" "}
            <span className="font-medium text-slate-900">{getAudioOutputModeLabel(value)}</span>
            {" · "}
            {active.howToInterrupt}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          aria-expanded={expanded}
        >
          {expanded ? "Hide options" : "Change listening mode"}
        </button>
      </div>

      {value === "speakers" && (
        <div className="border-t border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-xs font-medium text-amber-950">Speakers reminder</p>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-900">
            {active.speakersReminder}
          </p>
        </div>
      )}

      {expanded && (
        <div className="space-y-3 border-t border-slate-200 p-3">
          {hintText && (
            <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
              {hintText}
            </p>
          )}

          <p className="text-xs text-slate-600">
            Pick the option that matches where client audio actually plays. This controls whether
            your mic stays open or pauses while the client speaks.
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            {(["headphones", "speakers"] as const).map((mode) => {
              const details = AUDIO_OUTPUT_MODE_DETAILS[mode];
              const selected = value === mode;

              return (
                <label
                  key={mode}
                  className={`flex cursor-pointer flex-col rounded-md border px-3 py-3 text-sm ${
                    selected
                      ? "border-slate-900 bg-white text-slate-900 shadow-sm"
                      : "border-slate-200 bg-white/70 text-slate-700"
                  }`}
                >
                  <span className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="audio-output-mode"
                      value={mode}
                      checked={selected}
                      onChange={() => onChange(mode)}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium">{details.label}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-slate-600">
                        {details.bestFor}
                      </span>
                    </span>
                  </span>
                  <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
                    <li>
                      <span className="font-medium text-slate-800">When client is silent:</span>{" "}
                      {details.micWhileClientSilent}
                    </li>
                    <li>
                      <span className="font-medium text-slate-800">When client is speaking:</span>{" "}
                      {details.micWhileClientSpeaking}
                    </li>
                    <li>
                      <span className="font-medium text-slate-800">To talk over the client:</span>{" "}
                      {details.howToInterrupt}
                    </li>
                  </ul>
                </label>
              );
            })}
          </div>

          {value === "speakers" && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Using {inactive.label}? Switch above so voice barge-in works the way you expect.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

type ListeningModeStatusBarProps = {
  mode: AudioOutputMode;
  listening: boolean;
  clientSpeaking: boolean;
  micMuted: boolean;
  userMuted?: boolean;
  onInterrupt?: () => void;
};

export function ListeningModeStatusBar({
  mode,
  listening,
  clientSpeaking,
  micMuted,
  onInterrupt,
}: ListeningModeStatusBarProps) {
  if (!listening) {
    return null;
  }

  const details = AUDIO_OUTPUT_MODE_DETAILS[mode];
  const speakersClientActive = mode === "speakers" && clientSpeaking;
  const userSelfMuted = micMuted && !speakersClientActive;

  if (speakersClientActive) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-amber-950">
              Client speaking · {details.label} mode
            </p>
            <p className="mt-1 text-sm leading-relaxed text-amber-900">
              Your mic is paused right now. It will <span className="font-medium">not</span> hear
              you until you click <span className="font-medium">Interrupt client</span> or the mic
              button.
            </p>
          </div>
          {onInterrupt && (
            <button
              type="button"
              onClick={onInterrupt}
              className="shrink-0 rounded-md bg-amber-900 px-3 py-2 text-sm font-medium text-white hover:bg-amber-800"
            >
              Interrupt client
            </button>
          )}
        </div>
      </div>
    );
  }

  if (userSelfMuted) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
        <p className="text-sm text-slate-700">
          <span className="font-medium">{details.label} mode · Mic muted.</span> Tap the mic button
          to unmute before you speak.
        </p>
      </div>
    );
  }

  if (mode === "speakers") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5">
        <p className="text-sm text-amber-950">
          <span className="font-medium">{details.label} mode · Mic live.</span> When the client
          starts speaking, your mic will pause automatically. Use Interrupt client to jump in — it
          will not unpause just because you start talking.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2.5">
      <p className="text-sm text-emerald-900">
        <span className="font-medium">{details.label} mode · Mic live.</span> Speak anytime to
        interrupt the client.
      </p>
    </div>
  );
}

/** Shorter selector for the first-time mic permission step. */
export function ListeningModeSetup({
  value,
  onChange,
  hint = null,
}: {
  value: AudioOutputMode;
  onChange: (mode: AudioOutputMode) => void;
  hint?: AudioOutputModeHint | null;
}) {
  const hintText = getAudioOutputModeHintText(hint);

  return (
    <div className="mt-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-slate-900">Choose your listening mode first</p>
        <p className="mt-1 text-xs text-slate-600">
          This decides whether your mic stays open or pauses while the client speaks.
        </p>
      </div>

      {hintText && (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {hintText}
        </p>
      )}

      <ListeningModePanel value={value} onChange={onChange} defaultExpanded />
    </div>
  );
}
