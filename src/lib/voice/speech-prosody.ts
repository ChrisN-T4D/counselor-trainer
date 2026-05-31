export type ProsodySample = {
  time: number;
  rms: number;
  pitchHz: number | null;
};

export type TerminalIntonationResult = {
  isTerminal: boolean;
  score: number;
  pitchFallRatio: number;
  energyFallRatio: number;
};

const MIN_VOICED_SAMPLES = 4;
const MIN_PITCH_HZ = 75;
const MAX_PITCH_HZ = 400;

/** Estimate fundamental frequency (Hz) via autocorrelation; null when unvoiced. */
export function estimatePitchHz(samples: Float32Array, sampleRate: number): number | null {
  if (samples.length < 64 || sampleRate <= 0) {
    return null;
  }

  let mean = 0;
  for (let i = 0; i < samples.length; i += 1) {
    mean += samples[i];
  }
  mean /= samples.length;

  let maxAmplitude = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const centered = samples[i] - mean;
    maxAmplitude = Math.max(maxAmplitude, Math.abs(centered));
  }

  if (maxAmplitude < 0.004) {
    return null;
  }

  const minLag = Math.floor(sampleRate / MAX_PITCH_HZ);
  const maxLag = Math.min(Math.floor(sampleRate / MIN_PITCH_HZ), samples.length - 1);

  let bestLag = 0;
  let bestCorrelation = 0;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    for (let i = 0; i < samples.length - lag; i += 1) {
      correlation += (samples[i] - mean) * (samples[i + lag] - mean);
    }

    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  if (bestLag === 0 || bestCorrelation <= 0) {
    return null;
  }

  const pitchHz = sampleRate / bestLag;
  if (pitchHz < MIN_PITCH_HZ || pitchHz > MAX_PITCH_HZ) {
    return null;
  }

  return pitchHz;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function splitPitchHalves(pitches: number[]): { first: number[]; second: number[] } {
  const midpoint = Math.max(1, Math.floor(pitches.length / 2));
  return {
    first: pitches.slice(0, midpoint),
    second: pitches.slice(midpoint),
  };
}

/** Score how "finished" the trailing speech sounds (falling pitch + fading energy). */
export function scoreTerminalIntonation(samples: ProsodySample[]): TerminalIntonationResult {
  const voiced = samples.filter((sample) => sample.pitchHz !== null && sample.pitchHz > 0);

  if (voiced.length < MIN_VOICED_SAMPLES) {
    return { isTerminal: false, score: 0, pitchFallRatio: 0, energyFallRatio: 0 };
  }

  const pitches = voiced.map((sample) => sample.pitchHz as number);
  const { first, second } = splitPitchHalves(pitches);
  const firstMedian = median(first);
  const secondMedian = median(second);

  const pitchFallRatio =
    firstMedian > 0 ? Math.max(0, (firstMedian - secondMedian) / firstMedian) : 0;

  const recentEnergy = samples.slice(-Math.min(8, samples.length));
  const energyMidpoint = Math.max(1, Math.floor(recentEnergy.length / 2));
  const energyFirst = recentEnergy.slice(0, energyMidpoint);
  const energySecond = recentEnergy.slice(energyMidpoint);
  const energyFirstAvg =
    energyFirst.reduce((sum, sample) => sum + sample.rms, 0) / Math.max(1, energyFirst.length);
  const energySecondAvg =
    energySecond.reduce((sum, sample) => sum + sample.rms, 0) / Math.max(1, energySecond.length);

  const energyFallRatio =
    energyFirstAvg > 0 ? Math.max(0, (energyFirstAvg - energySecondAvg) / energyFirstAvg) : 0;

  const pitchScore = Math.min(1, pitchFallRatio / 0.12);
  const energyScore = Math.min(1, energyFallRatio / 0.18);
  const score = pitchScore * 0.65 + energyScore * 0.35;
  const isTerminal = score >= 0.45 && pitchFallRatio >= 0.06;

  return { isTerminal, score, pitchFallRatio, energyFallRatio };
}

export function silenceMsForTerminalScore(score: number, isTerminal: boolean): number {
  if (isTerminal && score >= 0.7) {
    return 750;
  }
  if (isTerminal || score >= 0.35) {
    return 1200;
  }
  return 2200;
}
