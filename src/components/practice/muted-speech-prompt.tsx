"use client";

import type { MutedSpeechPromptState } from "@/components/practice/use-practice-voice";

type MutedSpeechPromptProps = {
  prompt: MutedSpeechPromptState;
  onDismiss: () => void;
  onConfirm: () => void;
};

export function MutedSpeechPrompt({ prompt, onDismiss, onConfirm }: MutedSpeechPromptProps) {
  if (!prompt.visible) {
    return null;
  }

  const title = prompt.clientSpeaking
    ? "Your mic is paused while the client speaks"
    : "You are muted";

  const body = prompt.clientSpeaking
    ? "We heard you trying to talk. On speakers, your mic stays paused during client speech — interrupt the client to jump in."
    : "We heard you trying to talk, but your microphone is muted.";

  const confirmLabel = prompt.clientSpeaking ? "Interrupt client" : "Unmute and speak";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/35"
        aria-label="Dismiss muted speech prompt"
        onClick={onDismiss}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="muted-speech-prompt-title"
        className="relative w-full max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-xl"
      >
        <p id="muted-speech-prompt-title" className="text-base font-semibold text-slate-900">
          {title}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
        <p className="mt-2 text-sm font-medium text-slate-800">Are you trying to speak?</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Stay muted
          </button>
        </div>
      </div>
    </div>
  );
}
