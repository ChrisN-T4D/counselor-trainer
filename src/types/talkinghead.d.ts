declare module "@met4citizen/talkinghead/modules/talkinghead.mjs" {
  export class TalkingHead {
    constructor(node: HTMLElement, opt?: Record<string, unknown>);
    showAvatar(
      avatar: Record<string, unknown>,
      onprogress?: ((url: string, event: ProgressEvent) => void) | null,
    ): Promise<void>;
    speakAudio(
      audio: Record<string, unknown>,
      opt?: Record<string, unknown>,
      onsubtitles?: ((node: HTMLElement) => void) | null,
    ): void;
    stopSpeaking(): void;
    setMood(mood: string): void;
    dispose(): void;
    isSpeaking?: boolean;
    isAudioPlaying?: boolean;
  }
}
