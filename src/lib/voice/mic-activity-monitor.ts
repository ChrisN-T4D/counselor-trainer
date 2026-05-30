type MicActivityMonitorOptions = {
  onSpeechDetected: () => void;
  /** Use a higher bar while client TTS may bleed into the mic (speakers mode). */
  strict?: () => boolean;
};

type MicActivityMonitor = {
  stop: () => void;
};

const NORMAL_RMS_THRESHOLD = 0.018;
const STRICT_RMS_THRESHOLD = 0.04;
const NORMAL_SUSTAINED_MS = 320;
const STRICT_SUSTAINED_MS = 650;

function computeRms(analyser: AnalyserNode, buffer: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buffer);
  let sum = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    const sample = (buffer[index] - 128) / 128;
    sum += sample * sample;
  }
  return Math.sqrt(sum / buffer.length);
}

export async function startMicActivityMonitor(
  options: MicActivityMonitorOptions,
): Promise<MicActivityMonitor> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);

  const buffer = new Uint8Array(new ArrayBuffer(analyser.fftSize));
  let rafId = 0;
  let loudSince: number | null = null;
  let stopped = false;

  const tick = (timestamp: number) => {
    if (stopped) {
      return;
    }

    const strict = options.strict?.() ?? false;
    const threshold = strict ? STRICT_RMS_THRESHOLD : NORMAL_RMS_THRESHOLD;
    const sustainedMs = strict ? STRICT_SUSTAINED_MS : NORMAL_SUSTAINED_MS;
    const rms = computeRms(analyser, buffer);

    if (rms >= threshold) {
      if (loudSince === null) {
        loudSince = timestamp;
      } else if (timestamp - loudSince >= sustainedMs) {
        loudSince = null;
        options.onSpeechDetected();
      }
    } else {
      loudSince = null;
    }

    rafId = window.requestAnimationFrame(tick);
  };

  rafId = window.requestAnimationFrame(tick);

  return {
    stop: () => {
      stopped = true;
      window.cancelAnimationFrame(rafId);
      stream.getTracks().forEach((track) => track.stop());
      source.disconnect();
      void audioContext.close();
    },
  };
}
