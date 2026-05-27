export interface SttProvider {
  transcribe(audio: Blob, opts?: { language?: string }): Promise<string>;
}
