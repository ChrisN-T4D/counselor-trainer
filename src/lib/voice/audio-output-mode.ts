export type AudioOutputMode = "headphones" | "speakers";

export type AudioOutputModeHint = "saved" | "detected" | "default";

const STORAGE_KEY = "counselor-trainer:audio-output-mode";

const HEADPHONE_LABEL =
  /headphone|headset|earbud|ear pod|airpod|wh-1000|usb audio|bluetooth.*audio/i;

export type AudioOutputModeDetails = {
  label: string;
  micWhileClientSilent: string;
  micWhileClientSpeaking: string;
  howToInterrupt: string;
  bestFor: string;
  speakersReminder: string | null;
};

export const AUDIO_OUTPUT_MODE_DETAILS: Record<AudioOutputMode, AudioOutputModeDetails> = {
  headphones: {
    label: "Headphones",
    micWhileClientSilent: "Your mic stays open — speak naturally and we send when your thought finishes.",
    micWhileClientSpeaking: "Your mic stays open — start speaking anytime to interrupt the client.",
    howToInterrupt: "Start speaking — the client stops when you talk.",
    bestFor: "Headphones, earbuds, or any setup where the client cannot be heard in your mic.",
    speakersReminder: null,
  },
  speakers: {
    label: "Speakers",
    micWhileClientSilent: "Your mic opens automatically — just speak when you're ready.",
    micWhileClientSpeaking: "Your mic pauses while the client speaks so their voice isn't transcribed as yours.",
    howToInterrupt:
      "Click Interrupt client while they are speaking, or wait for them to finish — your mic opens automatically.",
    bestFor: "Laptop speakers, desk monitors, or any setup where client audio plays out loud.",
    speakersReminder:
      "On speakers, your mic pauses while the client talks, then reopens when they finish. Speak naturally — we detect when you're done and send your response automatically.",
  },
};

export function loadAudioOutputMode(): AudioOutputMode | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.sessionStorage.getItem(STORAGE_KEY);
  if (stored === "headphones" || stored === "speakers") {
    return stored;
  }

  return null;
}

export function saveAudioOutputMode(mode: AudioOutputMode): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(STORAGE_KEY, mode);
}

/** Best-effort guess from output device labels (requires mic permission for labels). */
export async function detectLikelyAudioOutputMode(): Promise<AudioOutputMode | null> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return null;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter((device) => device.kind === "audiooutput");

    for (const device of outputs) {
      if (HEADPHONE_LABEL.test(device.label)) {
        return "headphones";
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function resolveDefaultAudioOutputMode(detected: AudioOutputMode | null): AudioOutputMode {
  return detected ?? "speakers";
}

export function shouldPauseMicDuringClient(mode: AudioOutputMode): boolean {
  return mode === "speakers";
}

export function shouldEnableVoiceBargeIn(mode: AudioOutputMode): boolean {
  return mode === "headphones";
}

export function looksLikeBargeInSpeech(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  const wordCount = trimmed.split(/\s+/).length;
  return wordCount >= 2 || trimmed.length >= 10;
}

export function getAudioOutputModeLabel(mode: AudioOutputMode): string {
  return AUDIO_OUTPUT_MODE_DETAILS[mode].label;
}

export function getAudioOutputModeHintText(hint: AudioOutputModeHint | null): string | null {
  switch (hint) {
    case "detected":
      return "We suggested this from your audio device. Change it below if you are actually using speakers or headphones.";
    case "default":
      return "Defaulting to speakers for accuracy. Switch to headphones if client audio plays only in your ears.";
    case "saved":
      return null;
    default:
      return null;
  }
}
