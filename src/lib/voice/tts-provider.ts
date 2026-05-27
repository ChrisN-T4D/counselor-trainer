export interface TtsProvider {
  synthesize(
    text: string,
    opts?: { voiceId?: string; stream?: boolean },
  ): Promise<ArrayBuffer>;
  synthesizeStream?(
    text: string,
    opts?: { voiceId?: string },
  ): ReadableStream<Uint8Array>;
}
