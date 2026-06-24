"use client";

/**
 * Convert a decoded {@link AudioBuffer} into 16 kHz mono 16-bit PCM — the input
 * PocketSphinx (Rhubarb) expects. Resampling/downmixing is done with an
 * `OfflineAudioContext` so the browser's high-quality resampler does the work.
 */
export async function audioBufferToPcm16Mono(
  audioBuffer: AudioBuffer,
  targetSampleRate = 16000,
): Promise<Int16Array> {
  const mono =
    audioBuffer.sampleRate === targetSampleRate && audioBuffer.numberOfChannels === 1
      ? audioBuffer
      : await resampleToMono(audioBuffer, targetSampleRate);

  return floatToPcm16(mono.getChannelData(0));
}

async function resampleToMono(
  audioBuffer: AudioBuffer,
  targetSampleRate: number,
): Promise<AudioBuffer> {
  const length = Math.max(1, Math.ceil(audioBuffer.duration * targetSampleRate));
  const Ctor =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  // 1 output channel => multi-channel sources are automatically downmixed to mono.
  const ctx = new Ctor(1, length, targetSampleRate);
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);
  source.start();
  return ctx.startRendering();
}

function floatToPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}
