export const DEFAULT_SILENCE_MS = 1800;
export const DEFAULT_SPEECH_THRESHOLD = 0.012;
export const DEFAULT_MIN_SPEECH_MS = 350;
const POLL_MS = 50;

export type VoiceActivityOptions = {
  silenceMs?: number;
  threshold?: number;
  minSpeechMs?: number;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
};

/** Monitor mic levels and fire callbacks when the user starts/stops speaking. */
export function monitorVoiceActivity(
  stream: MediaStream,
  options: VoiceActivityOptions = {},
): () => void {
  const silenceMs = options.silenceMs ?? DEFAULT_SILENCE_MS;
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
  let stopped = false;

  const intervalId = window.setInterval(() => {
    if (stopped) {
      return;
    }

    analyser.getFloatTimeDomainData(samples);
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i += 1) {
      sumSquares += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sumSquares / samples.length);
    const now = performance.now();

    if (rms >= threshold) {
      if (!speaking) {
        speaking = true;
        speechStartedAt = now;
        options.onSpeechStart?.();
      }
      silenceStartedAt = 0;
      return;
    }

    if (!speaking) {
      return;
    }

    if (silenceStartedAt === 0) {
      silenceStartedAt = now;
      return;
    }

    const silentFor = now - silenceStartedAt;
    const spokeFor = silenceStartedAt - speechStartedAt;

    if (silentFor >= silenceMs && spokeFor >= minSpeechMs) {
      speaking = false;
      silenceStartedAt = 0;
      speechStartedAt = 0;
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
