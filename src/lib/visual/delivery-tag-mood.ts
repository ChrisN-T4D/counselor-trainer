import { extractDeliveryTags } from "@/lib/voice/delivery-tags";
import type { AvatarMood } from "@/lib/visual/types";

/** Map client delivery tags to TalkingHead mood for the avatar panel. */
export function moodFromClientText(text: string): AvatarMood {
  const tags = extractDeliveryTags(text);

  if (tags.some((tag) => ["angry", "frustrated", "agitated"].includes(tag))) {
    return "angry";
  }
  if (tags.some((tag) => ["tearful", "crying", "sad", "upset"].includes(tag))) {
    return "sad";
  }
  if (tags.some((tag) => ["hesitant", "nervous"].includes(tag))) {
    return "fear";
  }

  return "neutral";
}
