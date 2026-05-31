export type PracticeViewMode = "text" | "avatar";

export type AvatarMood = "neutral" | "happy" | "sad" | "fear" | "angry" | "love" | "disgust" | "sleep";

export type VisualStatus = {
  visualEnabled: boolean;
  provider: string;
  error?: string;
};
