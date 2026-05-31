import {
  estimatePitchHz,
  type ProsodySample,
  scoreTerminalIntonation,
  silenceMsForTerminalScore,
} from "./speech-prosody";

export const DEFAULT_SILENCE_MS = 1800;
export const DEFAULT_SPEECH_THRESHOLD = 0.012;
export const DEFAULT_MIN_SPEECH_MS = 350;
const POLL_MS = 50;
const PROSODY_WINDOW_MS = 1400;

export type VoiceActivityOptions = {
  silenceMs?: number;
  threshold?: number;
  minSpeechMs?: number;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
};

function computeRms(samples: Float32Array): number {
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i += 1) {
    sumSquares += samples[i] * samples[i];
  }
  return Math.sqrt(sumSquares / samples.length);
}

function trimProsodyWindow(samples: ProsodySample[], now: number): ProsodySample[] {
  return samples.filter((sample) => now - sample.time <= PROSODY_WINDOW_MS);
}

/** Monitor mic levels, prosody, and fire callbacks when the user starts/stops speaking. */
export function monitorVoiceActivity(
  stream: MediaStream,
  options: VoiceActivityOptions = {},
): () => void {
  const fallbackSilenceMs = options.silenceMs ?? DEFAULT_SILENCE_MS;
  const threshold = options.threshold ?? DEFAULT_SPEECH_THRESHOLD;
  const minSpeechMs = options.minSpeechMs ?? DEFAULT_MIN_SPEECH_MS;

  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);

  const samples = new Float32Array(analyser.fftSize);
  let speaking = false;
  let speechStartedAt = 0;
  let silenceStartedAt = 0;
  let requiredSilenceMs = fallbackSilenceMs;
  let prosodySamples: ProsodySample[] = [];
  let stopped = false;

  const intervalId = window.setInterval(() => {
    if (stopped) {
      return;
    }

    analyser.getFloatTimeDomainData(samples);
    const rms = computeRms(samples);
    const now = performance.now();
    const pitchHz = estimatePitchHz(samples, audioContext.sampleRate);

    if (rms >= threshold) {
      prosodySamples = trimProsodyWindow(
        [...prosodySamples, { time: now, rms, pitchHz }],
        now,
      );

      if (!speaking) {
        speaking = true;
        speechStartedAt = now;
        prosodySamples = [{ time: now, rms, pitchHz }];
        options.onSpeechStart?.();
      }

      silenceStartedAt = 0;
      requiredSilenceMs = fallbackSilenceMs;
      return;
    }

    if (!speaking) {
      return;
    }

    if (silenceStartedAt === 0) {
      silenceStartedAt = now;
      const terminal = scoreTerminalIntonation(prosodySamples);
      requiredSilenceMs = silenceMsForTerminalScore(terminal.score, terminal.isTerminal);
      return;
    }

    const silentFor = now - silenceStartedAt;
    const spokeFor = silenceStartedAt - speechStartedAt;

    if (silentFor >= requiredSilenceMs && spokeFor >= minSpeechMs) {
      speaking = false;
      silenceStartedAt = 0;
      speechStartedAt = 0;
      requiredSilenceMs = fallbackSilenceMs;
      prosodySamples = [];
      options.onSpeechEnd?.();
    }
  }, POLL_MS);

  return () => {
    stopped = true;
    window.clearInterval(intervalId);
    source.disconnect();
    void audioContext.close();
  };
}
