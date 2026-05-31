export type VisualProviderId = "noop" | "talkinghead";

export function getVisualProvider(): VisualProviderId {
  const provider = process.env.VISUAL_PROVIDER ?? "noop";
  if (provider === "talkinghead") {
    return "talkinghead";
  }
  return "noop";
}

export function isVisualEnabled(): boolean {
  return getVisualProvider() === "talkinghead";
}
