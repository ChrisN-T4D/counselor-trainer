type ElevenLabsErrorDetail = {
  status?: string;
  message?: string;
};

export async function readElevenLabsError(
  response: Response,
  context: "TTS" | "STT",
): Promise<string> {
  let body: { detail?: unknown; message?: string } | null = null;

  try {
    body = (await response.json()) as { detail?: unknown; message?: string };
  } catch {
    body = null;
  }

  if (body) {
    if (typeof body.detail === "string" && body.detail.trim()) {
      return body.detail;
    }

    if (body.detail && typeof body.detail === "object") {
      const detail = body.detail as ElevenLabsErrorDetail;
      if (detail.message?.trim()) {
        return detail.message;
      }
      if (detail.status === "invalid_api_key" || detail.status === "missing_api_key") {
        return "Invalid or missing ElevenLabs API key. Check ELEVENLABS_API_KEY on Railway.";
      }
      if (detail.status === "quota_exceeded") {
        return "ElevenLabs quota exceeded. Check usage in your ElevenLabs account.";
      }
    if (detail.status === "paid_plan_required" || detail.status === "payment_required") {
      return "This voice requires a paid ElevenLabs plan. Use a premade voice (free tier) or upgrade your subscription.";
    }
    }

    if (typeof body.message === "string" && body.message.trim()) {
      return body.message;
    }
  }

  if (response.status === 401) {
    return "ElevenLabs rejected the API key. Verify ELEVENLABS_API_KEY on Railway matches your ElevenLabs dashboard.";
  }

  if (response.status === 402) {
    return "ElevenLabs credits exhausted. Check your plan or usage in the ElevenLabs dashboard.";
  }

  if (response.status === 404) {
    return context === "TTS"
      ? "ElevenLabs voice not found. Assign clientVoiceId on the scenario or set ELEVENLABS_VOICE_ID."
      : "ElevenLabs STT model or endpoint not found.";
  }

  return response.statusText || `ElevenLabs ${context} request failed`;
}
