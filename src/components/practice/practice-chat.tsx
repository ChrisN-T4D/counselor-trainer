"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePracticeVoice } from "@/components/practice/use-practice-voice";
import { MutedSpeechPrompt } from "@/components/practice/muted-speech-prompt";
import {
  ListeningModePanel,
  ListeningModeSetup,
  ListeningModeStatusBar,
} from "@/components/practice/listening-mode-panel";
import { formatClientTextForDisplay } from "@/lib/voice/delivery-tags";

type Message = {
  id: string;
  role: "CLIENT" | "THERAPIST" | "SYSTEM";
  content: string;
  sequence: number;
  createdAt: string;
};

type PracticeSession = {
  id: string;
  status: string;
  sessionNumber?: number;
  clientCaseId?: string | null;
  scenario: {
    title: string;
    contextLabel?: string;
    dsmCategory: string;
    presentingProblem: string;
  };
  messages: Message[];
};

type StreamEvent =
  | { type: "therapist"; message: Message }
  | { type: "delta"; content: string }
  | { type: "done"; clientMessage: Message }
  | { type: "error"; error: string; code?: string };

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path d="M6.3 4.2a1 1 0 0 1 1.52-.85l7.5 5.5a1 1 0 0 1 0 1.7l-7.5 5.5A1 1 0 0 1 6.3 15.8V4.2Z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <rect x="5" y="5" width="10" height="10" rx="1" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path d="M10 12.5a2.5 2.5 0 0 0 2.5-2.5V5.5A2.5 2.5 0 1 0 7.5 5.5v4.5A2.5 2.5 0 0 0 10 12.5Z" />
      <path d="M5 9.5a5 5 0 0 0 10 0h-1.25a3.75 3.75 0 0 1-7.5 0H5Z" />
      <path d="M9.25 14.625V16.5h1.5v-1.875A6.2 6.2 0 0 0 15.5 10h-1.25a4.95 4.95 0 0 1-9.5 0H4.5a6.2 6.2 0 0 0 4.75 4.625Z" />
    </svg>
  );
}

function MicMutedIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path d="M10 12.5a2.5 2.5 0 0 0 2.5-2.5V5.5A2.5 2.5 0 1 0 7.5 5.5v4.5A2.5 2.5 0 0 0 10 12.5Z" />
      <path d="M5 9.5a5 5 0 0 0 10 0h-1.25a3.75 3.75 0 0 1-7.5 0H5Z" />
      <path d="M3.5 3.5 16.5 16.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function PracticeChat({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [practiceSession, setPracticeSession] = useState<PracticeSession | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [streamingClientText, setStreamingClientText] = useState<string | null>(null);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const inputRef = useRef(input);
  inputRef.current = input;

  const {
    voiceStatus,
    voiceError,
    setVoiceError,
    playingMessageId,
    loadingPlayId,
    listening,
    connectingMic,
    micMuted,
    micPermission,
    audioOutputMode,
    audioOutputModeHint,
    setAudioOutputMode,
    clientSpeaking,
    playbackMicSuppressed,
    recording,
    transcribing,
    playClientMessage,
    bindTranscript,
    setSessionActive,
    syncTranscriptBase,
    prepareForSend,
    requestMicAccess,
    interruptClient,
    toggleMicMute,
    toggleBatchMic,
    mutedSpeechPrompt,
    dismissMutedSpeechPrompt,
    confirmTryToSpeak,
  } = usePracticeVoice(sessionId);

  useEffect(() => {
    bindTranscript(() => inputRef.current, setInput);
  }, [bindTranscript]);

  useEffect(() => {
    setSessionActive(practiceSession?.status === "ACTIVE");
  }, [practiceSession?.status, setSessionActive]);

  useEffect(() => {
    async function loadSession() {
      const response = await fetch(`/api/sessions/${sessionId}`);
      if (!response.ok) {
        setError("Could not load session");
        setLoading(false);
        return;
      }

      const data = (await response.json()) as { session: PracticeSession };
      setPracticeSession(data.session);
      setLoading(false);
    }

    loadSession();
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [practiceSession?.messages.length, sending, streamingClientText]);

  async function handleBatchMicToggle() {
    const text = await toggleBatchMic();
    if (text) {
      setInput((current) => (current.trim() ? `${current.trim()} ${text}` : text));
    }
    textareaRef.current?.focus();
  }

  function handleInputChange(value: string) {
    setInput(value);
    if (voiceStatus.sttRealtime && listening) {
      syncTranscriptBase(value);
    }
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    if (!input.trim() || sending || practiceSession?.status !== "ACTIVE") {
      return;
    }

    const messageText = input.trim();
    prepareForSend();
    setSending(true);
    setError(null);
    setVoiceError(null);
    setStreamingClientText("");
    setStreamingMessageId("streaming");
    setInput("");

    const response = await fetch(`/api/sessions/${sessionId}/turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: messageText }),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Failed to send message");
      setStreamingClientText(null);
      setStreamingMessageId(null);
      setSending(false);
      return;
    }

    if (!response.body) {
      setError("No response stream from server");
      setStreamingClientText(null);
      setStreamingMessageId(null);
      setSending(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let therapistMessage: Message | null = null;
    let clientMessage: Message | null = null;
    let accumulated = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          const event = JSON.parse(line) as StreamEvent;

          if (event.type === "therapist") {
            therapistMessage = event.message;
            setPracticeSession((current) =>
              current
                ? { ...current, messages: [...current.messages, event.message] }
                : current,
            );
          } else if (event.type === "delta") {
            accumulated += event.content;
            setStreamingClientText(accumulated);
          } else if (event.type === "done") {
            clientMessage = event.clientMessage;
          } else if (event.type === "error") {
            throw new Error(event.error);
          }
        }
      }

      if (clientMessage) {
        setPracticeSession((current) =>
          current
            ? { ...current, messages: [...current.messages, clientMessage!] }
            : current,
        );

        if (voiceStatus.ttsEnabled) {
          void playClientMessage(clientMessage.id, clientMessage.content);
        }
      } else if (!therapistMessage) {
        throw new Error("Session turn did not complete");
      } else {
        throw new Error("Client reply did not finish streaming");
      }
    } catch (streamError) {
      setError(streamError instanceof Error ? streamError.message : "Failed to send message");
    } finally {
      setStreamingClientText(null);
      setStreamingMessageId(null);
      setSending(false);
    }
  }

  async function handleEndSession() {
    setEnding(true);
    setError(null);

    const response = await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
    });

    if (!response.ok) {
      setError("Failed to end session");
      setEnding(false);
      return;
    }

    router.push(`/review/${sessionId}`);
    router.refresh();
  }

  function renderPlayButton(messageId: string, text: string, label: string) {
    if (!voiceStatus.ttsEnabled) {
      return null;
    }

    const isPlaying = playingMessageId === messageId;
    const isLoading = loadingPlayId === messageId;

    return (
      <button
        type="button"
        onClick={() => playClientMessage(messageId, text)}
        disabled={isLoading || !text.trim()}
        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        aria-label={isPlaying ? `Stop ${label}` : `Play ${label}`}
      >
        {isLoading ? (
          "Loading..."
        ) : isPlaying ? (
          <>
            <StopIcon />
            Stop
          </>
        ) : (
          <>
            <PlayIcon />
            Play
          </>
        )}
      </button>
    );
  }

  if (loading) {
    return <p className="text-slate-600">Loading session...</p>;
  }

  if (!practiceSession) {
    return <p className="text-red-600">{error ?? "Session not found"}</p>;
  }

  const displayError = error ?? voiceError;
  const voiceBusy = connectingMic || recording || transcribing;
  const showMicPrompt =
    voiceStatus.sttEnabled &&
    voiceStatus.sttRealtime &&
    practiceSession.status === "ACTIVE" &&
    (micPermission === "unknown" || micPermission === "prompt" || micPermission === "denied") &&
    !listening;
  const showMicReconnect =
    voiceStatus.sttEnabled &&
    voiceStatus.sttRealtime &&
    practiceSession.status === "ACTIVE" &&
    micPermission === "granted" &&
    !listening &&
    !connectingMic;

  const showAudioSetup =
    voiceStatus.sttEnabled &&
    voiceStatus.sttRealtime &&
    practiceSession.status === "ACTIVE" &&
    (voiceStatus.ttsEnabled || voiceStatus.sttEnabled);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h1 className="text-xl font-semibold text-slate-900">{practiceSession.scenario.title}</h1>
        {practiceSession.sessionNumber && practiceSession.sessionNumber > 0 && (
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            Session {practiceSession.sessionNumber}
            {practiceSession.clientCaseId ? " · continuing case" : ""}
          </p>
        )}
        <p className="mt-1 text-sm text-slate-600">
          {practiceSession.scenario.contextLabel
            ? `${practiceSession.scenario.contextLabel} · `
            : ""}
          {practiceSession.scenario.dsmCategory}
        </p>
        <p className="mt-2 text-sm text-slate-700">{practiceSession.scenario.presentingProblem}</p>
        <p className="mt-2 text-xs text-slate-500">
          Full case write-up is hidden during practice and revealed after session completion.
        </p>
        {showAudioSetup && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <ListeningModePanel
              value={audioOutputMode}
              onChange={setAudioOutputMode}
              hint={audioOutputModeHint}
            />
          </div>
        )}
      </div>

      <div className="min-h-[420px] rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="space-y-3">
          {practiceSession.messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                message.role === "THERAPIST"
                  ? "ml-auto bg-slate-900 text-white"
                  : "bg-white text-slate-900 shadow-sm"
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs font-medium opacity-70">
                  {message.role === "THERAPIST" ? "You (Therapist)" : "Client"}
                </p>
                {message.role === "CLIENT" &&
                  renderPlayButton(message.id, message.content, "client message")}
              </div>
              <p className="whitespace-pre-wrap">
                {formatClientTextForDisplay(message.content)}
              </p>
            </div>
          ))}
          {streamingClientText !== null && streamingMessageId && (
            <div className="max-w-[85%] rounded-lg bg-white px-3 py-2 text-sm text-slate-900 shadow-sm">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs font-medium opacity-70">Client</p>
                {renderPlayButton(streamingMessageId, streamingClientText, "streaming client message")}
              </div>
              <p className="whitespace-pre-wrap">
                {formatClientTextForDisplay(streamingClientText, true)}
                <span className="ml-0.5 inline-block animate-pulse text-slate-400">▍</span>
              </p>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {practiceSession.status === "ACTIVE" ? (
        <form onSubmit={handleSend} className="flex flex-col gap-3">
          {showMicReconnect && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-900">Microphone disconnected.</p>
              <button
                type="button"
                onClick={() => void requestMicAccess()}
                className="mt-2 text-sm font-medium text-amber-900 underline"
              >
                Reconnect microphone
              </button>
            </div>
          )}
          {showMicPrompt && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm font-medium text-slate-900">Enable your microphone</p>
              <p className="mt-1 text-sm text-slate-600">
                This session works best when you can speak naturally, like a real therapy room.
                Your browser will ask for microphone access — choose Allow to begin.
              </p>
              <ListeningModeSetup
                value={audioOutputMode}
                onChange={setAudioOutputMode}
                hint={audioOutputModeHint}
              />
              <button
                type="button"
                onClick={() => void requestMicAccess()}
                disabled={connectingMic}
                className="mt-3 rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {connectingMic ? "Connecting microphone…" : "Enable microphone"}
              </button>
              {micPermission === "denied" && (
                <p className="mt-2 text-xs text-slate-500">
                  If you previously blocked access, open your browser&apos;s site settings for this
                  page and allow the microphone, then try again.
                </p>
              )}
            </div>
          )}
          {voiceStatus.sttRealtime && listening && (
            <ListeningModeStatusBar
              mode={audioOutputMode}
              listening={listening}
              clientSpeaking={clientSpeaking}
              micMuted={micMuted}
              onInterrupt={interruptClient}
            />
          )}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => handleInputChange(event.target.value)}
              placeholder={
                voiceStatus.sttRealtime && listening
                  ? "Speak naturally — your words appear here…"
                  : "Respond as the therapist..."
              }
              rows={3}
              className="field-input pr-12"
              disabled={sending || connectingMic || transcribing || recording}
            />
            {voiceStatus.sttEnabled && voiceStatus.sttRealtime && listening && (
              <button
                type="button"
                onClick={toggleMicMute}
                disabled={sending || connectingMic}
                className={`absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-md border ${
                  micMuted
                    ? "border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
                    : "border-red-300 bg-red-50 text-red-700"
                } disabled:opacity-50`}
                aria-label={
                  playbackMicSuppressed
                    ? "Interrupt client and unmute microphone"
                    : micMuted
                      ? "Unmute microphone"
                      : "Mute microphone"
                }
                title={
                  playbackMicSuppressed
                    ? "Interrupt client and unmute microphone"
                    : micMuted
                      ? "Unmute microphone"
                      : "Mute microphone"
                }
              >
                {micMuted ? <MicMutedIcon /> : <MicIcon />}
              </button>
            )}
            {voiceStatus.sttEnabled && !voiceStatus.sttRealtime && (
              <button
                type="button"
                onClick={() => void handleBatchMicToggle()}
                disabled={sending || connectingMic || transcribing}
                className={`absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-md border ${
                  recording
                    ? "border-red-300 bg-red-50 text-red-700"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                } disabled:opacity-50`}
                aria-label={recording ? "Stop recording" : "Record therapist response"}
                title={recording ? "Stop recording" : "Record therapist response"}
              >
                <MicIcon />
              </button>
            )}
          </div>
          {connectingMic && (
            <p className="text-sm text-slate-600">Connecting microphone…</p>
          )}
          {recording && !voiceStatus.sttRealtime && (
            <p className="text-sm text-red-600">Recording… click the mic again to stop and transcribe.</p>
          )}
          {transcribing && !voiceStatus.sttRealtime && (
            <p className="text-sm text-slate-600">Transcribing your response…</p>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={sending || connectingMic || transcribing || recording || !input.trim()}
              className="rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send response"}
            </button>
            <button
              type="button"
              onClick={handleEndSession}
              disabled={ending || voiceBusy}
              className="rounded-md border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {ending ? "Ending..." : "End session"}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">This session has ended.</p>
          <a
            href={`/review/${sessionId}`}
            className="inline-block text-sm font-medium text-slate-900 underline"
          >
            Open session review and revealed case write-up
          </a>
        </div>
      )}

      {displayError && <p className="text-sm text-red-600">{displayError}</p>}

      <MutedSpeechPrompt
        prompt={mutedSpeechPrompt}
        onDismiss={dismissMutedSpeechPrompt}
        onConfirm={confirmTryToSpeak}
      />
    </div>
  );
}
