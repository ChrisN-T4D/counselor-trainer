type ScribeErrorPayload = {
  message_type?: string;
  error?: string;
  message?: string;
};

export function formatScribeRealtimeError(data: unknown): string {
  if (data instanceof Error) {
    if (data.message.includes("1006")) {
      return "Live transcription disconnected before the session started. Check Railway env vars (STT_PROVIDER=elevenlabs, ELEVENLABS_API_KEY), accept Scribe Realtime terms in ElevenLabs, and confirm your plan includes realtime speech-to-text.";
    }
    if (data.message.includes("1000")) {
      return "Live transcription ended.";
    }
    return data.message;
  }

  if (typeof data !== "object" || data === null) {
    return "Live transcription error";
  }

  const payload = data as ScribeErrorPayload;
  const detail = payload.error ?? payload.message;

  switch (payload.message_type) {
    case "auth_error":
      return detail
        ? `ElevenLabs authentication failed: ${detail}`
        : "ElevenLabs authentication failed. Verify ELEVENLABS_API_KEY on Railway.";
    case "unaccepted_terms":
      return "Accept Scribe Realtime terms at elevenlabs.io/scribe-v2-realtime-terms (or Speech-to-Text in the ElevenLabs dashboard), then reconnect.";
    case "quota_exceeded":
      return "ElevenLabs quota exceeded. Check usage and billing in your ElevenLabs account.";
    case "rate_limited":
      return "ElevenLabs rate limit hit. Wait a moment and reconnect the microphone.";
    case "input_error":
      return detail ? `Live transcription input error: ${detail}` : "Live transcription input error.";
    case "transcriber_error":
      return detail ? `Live transcription failed: ${detail}` : "Live transcription failed on ElevenLabs.";
    case "resource_exhausted":
      return "ElevenLabs realtime transcription capacity is exhausted. Try again shortly.";
    default:
      return detail ?? "Live transcription error";
  }
}

export function parseElevenLabsTokenError(body: string): string {
  let message = "Could not create Scribe token";
  try {
    const parsed = JSON.parse(body) as { detail?: { status?: string; message?: string } };
    const status = parsed.detail?.status;
    if (status === "unaccepted_terms") {
      return "Accept Scribe Realtime terms at elevenlabs.io/scribe-v2-realtime-terms, then reconnect.";
    }
    if (parsed.detail?.message) {
      return parsed.detail.message;
    }
  } catch {
    // Keep generic message when body is not JSON.
  }
  return message;
}
