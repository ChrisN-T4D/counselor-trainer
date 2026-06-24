"use client";

// While the trainee is speaking, a real client listens and reacts: they hold eye
// contact, give small backchannel nods at natural pauses, and their arousal
// tracks the trainee's vocal energy. This controller is content-free ($0, no
// STT) — it is driven purely by mic RMS from `monitorVoiceActivity`. Semantic
// reactions (to *what* is said) arrive later via streaming STT (Phase 2).

const SPEECH_FLOOR = 0.012; // RMS above which we consider the trainee speaking
const NOD_MIN_GAP_S = 2.4; // min seconds between backchannel nods
const AROUSAL_INTERVAL_S = 0.5; // how often to nudge arousal from energy
const RMS_EMA_TAU = 0.4; // smoothing time constant for level tracking

type ListeningOptions = {
  /** Relative arousal nudge (can be negative to settle). */
  onArousalNudge: (delta: number) => void;
  /** Fire a short backchannel nod. */
  onNod: () => void;
};

export class ListeningController {
  private active = false;
  private emaRms = 0;
  private speaking = false;
  private clock = 0;
  private lastNodAt = -Infinity;
  private arousalAccum = 0;

  constructor(private readonly options: ListeningOptions) {}

  start() {
    this.active = true;
    this.emaRms = 0;
    this.speaking = false;
    this.clock = 0;
    this.lastNodAt = -Infinity;
    this.arousalAccum = 0;
  }

  /** Feed one mic-level sample (RMS) from the VAD poll loop. */
  feedLevel(rms: number, dtSeconds: number) {
    if (!this.active || dtSeconds <= 0) return;
    this.clock += dtSeconds;

    const alpha = 1 - Math.exp(-dtSeconds / RMS_EMA_TAU);
    this.emaRms += (rms - this.emaRms) * alpha;

    const nowSpeaking = rms >= SPEECH_FLOOR;
    // Falling edge (a pause) is a natural backchannel moment.
    if (this.speaking && !nowSpeaking && this.clock - this.lastNodAt >= NOD_MIN_GAP_S) {
      this.lastNodAt = this.clock;
      this.options.onNod();
    }
    this.speaking = nowSpeaking;

    // Track the trainee's energy into arousal at a slow cadence (energized
    // delivery raises the client's activation; quiet lets it settle).
    this.arousalAccum += dtSeconds;
    if (this.arousalAccum >= AROUSAL_INTERVAL_S) {
      this.arousalAccum = 0;
      const energy = Math.min(1, Math.max(0, (this.emaRms - SPEECH_FLOOR) * 12));
      // Small bipolar nudge: +toward energy, gentle settle when quiet.
      this.options.onArousalNudge((energy - 0.25) * 0.06);
    }
  }

  stop() {
    this.active = false;
  }
}
