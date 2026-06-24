"use client";

// Optional, pause-aligned audio backchannels ("mm-hm", soft "yeah") played while
// the trainee pauses, to make the client feel present. OFF by default and only
// fired at detected pauses (never over speech). Audio clips are supplied via
// NEXT_PUBLIC_BACKCHANNEL_URLS (comma-separated public paths); with none set the
// player is inert, so the visual nod remains the only backchannel.

const MIN_GAP_MS = 6000;

function readUrls(): string[] {
  const raw = process.env.NEXT_PUBLIC_BACKCHANNEL_URLS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
}

export class BackchannelPlayer {
  private readonly urls = readUrls();
  private lastPlayedAt = 0;
  private volume: number;

  constructor(volume = 0.35) {
    this.volume = volume;
  }

  get enabled(): boolean {
    return this.urls.length > 0;
  }

  /** Play a random backchannel clip, rate-limited. Safe no-op when disabled. */
  play() {
    if (!this.enabled) return;
    const now = performance.now();
    if (now - this.lastPlayedAt < MIN_GAP_MS) return;
    this.lastPlayedAt = now;

    const url = this.urls[Math.floor(Math.random() * this.urls.length)];
    try {
      const audio = new Audio(url);
      audio.volume = this.volume;
      void audio.play().catch(() => undefined);
    } catch {
      // Ignore playback failures (missing asset, autoplay policy, etc.).
    }
  }
}
