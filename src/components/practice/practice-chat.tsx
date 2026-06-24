"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ClientPresencePanel,
  type AvatarController,
  type AvatarPlaybackHandle,
} from "@/components/practice/client-presence-panel";

const TherapyScene = dynamic(() => import("@/components/practice/scene/therapy-scene"), {
  ssr: false,
  loading: () => (
    <div className="flex aspect-[16/9] items-center justify-center rounded-lg border border-slate-200 bg-slate-900 text-sm text-slate-300">
      Preparing 3D room…
    </div>
  ),
});
import { usePracticeVoice } from "@/components/practice/use-practice-voice";
import { usePracticeViewMode } from "@/components/practice/use-practice-view-mode";
import { PracticeViewToggle } from "@/components/practice/practice-view-toggle";
import { ListeningModePanel, ListeningModeStatusBar } from "@/components/practice/listening-mode-panel";
import { AffectRadarOverlay } from "@/components/practice/affect-radar-overlay";
import {
  getAvatarCatalogEntry,
  resolveClientAvatarKeyForScenario,
} from "@/lib/visual/avatar-catalog";
import type { PublicParticipant } from "@/lib/sessions/participants";
import type { VisualStatus } from "@/lib/visual/types";
import { formatClientTextForDisplay } from "@/lib/voice/delivery-tags";
import type { EmotionVector } from "@/lib/affect/emotion";
import type { ReactionCue } from "@/lib/affect/emotion-state";
import type { ExpressivityProfile } from "@/lib/affect/expressivity-profile";

const SINGLE_AVATAR_KEY = "__single__";

const SPEAKER_ACCENTS = [
  { name: "text-rose-700", border: "border-l-rose-400" },
  { name: "text-sky-700", border: "border-l-sky-400" },
  { name: "text-violet-700", border: "border-l-violet-400" },
  { name: "text-amber-700", border: "border-l-amber-400" },
];

type Message = {
  id: string;
  role: "CLIENT" | "THERAPIST" | "SYSTEM";
  content: string;
  speaker?: string | null;
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
    ageGroup?: string;
    clientAvatarKey?: string | null;
    generationSettings?: unknown;
    participants?: PublicParticipant[] | null;
  };
  messages: Message[];
};

type StreamEvent =
  | { type: "therapist"; message: Message }
  | { type: "delta"; content: string }
  | { type: "affect"; felt: EmotionVector; arousal: number; rapport: number; cues: ReactionCue[]; profile: ExpressivityProfile }
  | { type: "done"; clientMessage?: Message; clientMessages?: Message[] }
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
  const [helpText, setHelpText] = useState<string | null>(null);
  const [helpLoading, setHelpLoading] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [visualStatus, setVisualStatus] = useState<VisualStatus>({
    visualEnabled: false,
    provider: "noop",
  });
  const voiceTurnStartedRef = useRef(false);
  const avatarHandlesRef = useRef<Map<string, AvatarPlaybackHandle>>(new Map());
  const avatarControllerRef = useRef<AvatarController>({
    getHandle: (speaker) => {
      const map = avatarHandlesRef.current;
      if (speaker && map.has(speaker)) {
        return map.get(speaker) ?? null;
      }
      return map.get(SINGLE_AVATAR_KEY) ?? map.values().next().value ?? null;
    },
    stopAll: () => {
      for (const handle of avatarHandlesRef.current.values()) {
        handle.stop();
      }
    },
  });

  const { viewMode, setViewMode, hydrated: viewModeHydrated } = usePracticeViewMode(
    visualStatus.visualEnabled,
  );

  // Single stable callback; each panel reports its own key so we can route playback per speaker.
  const handleAvatarReady = useCallback(
    (key: string, handle: AvatarPlaybackHandle | null) => {
      if (handle) {
        avatarHandlesRef.current.set(key, handle);
      } else {
        avatarHandlesRef.current.delete(key);
      }
    },
    [],
  );

  const {
    voiceStatus,
    voiceError,
    setVoiceError,
    playingMessageId,
    loadingPlayId,
    audioOutputMode,
    audioOutputModeHint,
    setAudioOutputMode,
    recording,
    listening,
    transcribing,
    voiceTurnActive,
    clientSpeaking,
    micPaused,
    simulationPaused,
    playClientMessage,
    playClientMessages,
    setSessionActive,
    interruptClient,
    setOnAutoSend,
    beginVoiceTurn,
    pauseVoiceTurnForSend,
    resumeVoiceTurnAfterSend,
    pauseSimulation,
    resumeSimulation,
    applyClientAffect,
    affectDebug,
    affectDebugEnabled,
  } = usePracticeVoice(sessionId, {
    viewMode: viewModeHydrated ? viewMode : "text",
    visualEnabled: visualStatus.visualEnabled,
    avatarControllerRef,
  });

  useEffect(() => {
    async function loadVisualStatus() {
      const response = await fetch("/api/visual/status");
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as VisualStatus;
      setVisualStatus(data);
    }

    void loadVisualStatus();
  }, []);

  useEffect(() => {
    setSessionActive(practiceSession?.status === "ACTIVE");
  }, [practiceSession?.status, setSessionActive]);

  useEffect(() => {
    async function loadSession() {
      try {
        const response = await fetch(`/api/sessions/${sessionId}`);
        if (!response.ok) {
          setError("Could not load session");
          return;
        }

        const data = (await response.json()) as { session: PracticeSession };
        setPracticeSession(data.session);
      } catch {
        setError("Could not reach the server. Is the app still running?");
      } finally {
        setLoading(false);
      }
    }

    loadSession();
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [practiceSession?.messages.length, sending, streamingClientText]);

  const sendMessage = useCallback(
    async (messageText: string) => {
      if (
        !messageText.trim() ||
        sending ||
        simulationPaused ||
        practiceSession?.status !== "ACTIVE"
      ) {
        return;
      }

      pauseVoiceTurnForSend();
      setSending(true);
      setError(null);
      setVoiceError(null);
      setStreamingClientText("");
      setStreamingMessageId("streaming");
      setInput("");

      const response = await fetch(`/api/sessions/${sessionId}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: messageText.trim() }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Failed to send message");
        setStreamingClientText(null);
        setStreamingMessageId(null);
        setSending(false);
        resumeVoiceTurnAfterSend();
        return;
      }

      if (!response.body) {
        setError("No response stream from server");
        setStreamingClientText(null);
        setStreamingMessageId(null);
        setSending(false);
        resumeVoiceTurnAfterSend();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let therapistMessage: Message | null = null;
      let clientMessages: Message[] = [];
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
            } else if (event.type === "affect") {
              applyClientAffect({
                felt: event.felt,
                arousal: event.arousal,
                rapport: event.rapport,
                cues: event.cues,
                profile: event.profile,
              });
            } else if (event.type === "done") {
              clientMessages = event.clientMessages ?? (event.clientMessage ? [event.clientMessage] : []);
            } else if (event.type === "error") {
              throw new Error(event.error);
            }
          }
        }

        if (clientMessages.length > 0) {
          setPracticeSession((current) =>
            current
              ? { ...current, messages: [...current.messages, ...clientMessages] }
              : current,
          );

          if (voiceStatus.ttsEnabled) {
            void playClientMessages(
              clientMessages.map((message) => ({
                id: message.id,
                text: message.content,
                speaker: message.speaker ?? null,
              })),
            );
          } else {
            resumeVoiceTurnAfterSend();
          }
        } else if (!therapistMessage) {
          throw new Error("Session turn did not complete");
        } else {
          throw new Error("Client reply did not finish streaming");
        }
      } catch (streamError) {
        setError(streamError instanceof Error ? streamError.message : "Failed to send message");
        resumeVoiceTurnAfterSend();
      } finally {
        setStreamingClientText(null);
        setStreamingMessageId(null);
        setSending(false);
      }
    },
    [
      applyClientAffect,
      pauseVoiceTurnForSend,
      playClientMessages,
      practiceSession?.status,
      resumeVoiceTurnAfterSend,
      sending,
      sessionId,
      setVoiceError,
      simulationPaused,
      voiceStatus.ttsEnabled,
    ],
  );

  useEffect(() => {
    setOnAutoSend((text) => sendMessage(text));
    return () => setOnAutoSend(null);
  }, [sendMessage, setOnAutoSend]);

  useEffect(() => {
    if (
      loading ||
      !practiceSession ||
      practiceSession.status !== "ACTIVE" ||
      !voiceTurnActive ||
      simulationPaused ||
      voiceTurnStartedRef.current
    ) {
      return;
    }

    voiceTurnStartedRef.current = true;

    // Replay the most recent client turn (which may be several attributed segments).
    const messages = practiceSession.messages;
    const trailing: Message[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "CLIENT") {
        trailing.unshift(messages[i]);
      } else {
        break;
      }
    }

    if (trailing.length > 0 && voiceStatus.ttsEnabled) {
      void playClientMessages(
        trailing.map((message) => ({
          id: message.id,
          text: message.content,
          speaker: message.speaker ?? null,
        })),
      );
      return;
    }

    beginVoiceTurn();
  }, [
    beginVoiceTurn,
    loading,
    playClientMessages,
    practiceSession,
    simulationPaused,
    voiceStatus.ttsEnabled,
    voiceTurnActive,
  ]);

  async function handleGetHelp() {
    if (helpLoading || practiceSession?.status !== "ACTIVE") {
      return;
    }

    const wasPaused = simulationPaused;
    if (!wasPaused) {
      pauseSimulation();
    }

    setHelpLoading(true);
    setError(null);
    setHelpOpen(true);

    try {
      const response = await fetch(`/api/sessions/${sessionId}/help`, { method: "POST" });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not load coaching suggestions");
      }

      const data = (await response.json()) as { suggestions: string };
      setHelpText(data.suggestions);
    } catch (helpError) {
      setError(helpError instanceof Error ? helpError.message : "Could not load coaching suggestions");
      setHelpOpen(false);
      if (!wasPaused) {
        resumeSimulation();
      }
    } finally {
      setHelpLoading(false);
    }
  }

  function handleTogglePause() {
    if (simulationPaused) {
      resumeSimulation();
    } else {
      pauseSimulation();
    }
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    if (!input.trim()) {
      return;
    }
    await sendMessage(input.trim());
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

  function renderPlayButton(
    messageId: string,
    text: string,
    label: string,
    speaker: string | null = null,
  ) {
    if (!voiceStatus.ttsEnabled) {
      return null;
    }

    const isPlaying = playingMessageId === messageId;
    const isLoading = loadingPlayId === messageId;

    return (
      <button
        type="button"
        onClick={() => playClientMessage(messageId, text, speaker)}
        disabled={isLoading || !text.trim() || simulationPaused}
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
  const voiceBusy = recording || transcribing || listening;
  const showAudioSetup =
    practiceSession.status === "ACTIVE" && (voiceStatus.ttsEnabled || voiceStatus.sttEnabled);
  const inputPlaceholder = voiceTurnActive
    ? "Type a response instead, or just speak when the mic is live…"
    : "Respond as the therapist...";

  const participants =
    practiceSession.scenario.participants && practiceSession.scenario.participants.length > 0
      ? practiceSession.scenario.participants
      : null;

  const avatarKey = resolveClientAvatarKeyForScenario({
    clientAvatarKey: practiceSession.scenario.clientAvatarKey,
    ageGroup: practiceSession.scenario.ageGroup,
    generationSettings: practiceSession.scenario.generationSettings,
  });
  const avatarEntry = getAvatarCatalogEntry(avatarKey) ?? null;

  const speakerIndex = new Map((participants ?? []).map((p, index) => [p.key, index]));
  const speakerName = (speaker?: string | null) =>
    participants?.find((p) => p.key === speaker)?.name ?? null;
  const speakerAccent = (speaker?: string | null) => {
    const index = speaker ? speakerIndex.get(speaker) : undefined;
    return index === undefined ? null : SPEAKER_ACCENTS[index % SPEAKER_ACCENTS.length];
  };

  const playingSpeaker =
    practiceSession.messages.find((message) => message.id === playingMessageId)?.speaker ?? null;

  const presenceLabel = clientSpeaking
    ? "Speaking"
    : listening || recording
      ? "Listening"
      : simulationPaused
        ? "Paused"
        : "In session";

  const showAvatarPanel = visualStatus.visualEnabled && viewModeHydrated && viewMode === "avatar";
  const showRoom = visualStatus.visualEnabled && viewModeHydrated && viewMode === "room";

  const sceneParticipants = (
    participants
      ? participants.map((participant) => ({
          key: participant.key,
          name: participant.name,
          avatarUrl: (getAvatarCatalogEntry(participant.avatarKey) ?? avatarEntry)?.modelUrl ?? "",
        }))
      : avatarEntry
        ? [{ key: SINGLE_AVATAR_KEY, name: "Client", avatarUrl: avatarEntry.modelUrl }]
        : []
  ).filter((participant) => participant.avatarUrl.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {affectDebugEnabled && affectDebug && <AffectRadarOverlay data={affectDebug} />}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-slate-900">{practiceSession.scenario.title}</h1>
          </div>
          <PracticeViewToggle
            viewMode={viewModeHydrated ? viewMode : "text"}
            visualEnabled={visualStatus.visualEnabled}
            onChange={setViewMode}
          />
        </div>
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

      {showAvatarPanel &&
        (participants ? (
          <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
            <img
              src="/scene/therapy-room.jpg"
              alt=""
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/60 via-slate-900/10 to-slate-900/30" />
            <div className="relative grid grid-cols-1 sm:grid-cols-2">
              {participants.map((participant) => (
                <ClientPresencePanel
                  key={participant.key}
                  panelKey={participant.key}
                  embedded
                  avatarEntry={getAvatarCatalogEntry(participant.avatarKey) ?? avatarEntry}
                  title={participant.name}
                  active={playingSpeaker === participant.key}
                  presenceLabel={playingSpeaker === participant.key ? "Speaking" : presenceLabel}
                  onReady={handleAvatarReady}
                />
              ))}
            </div>
          </div>
        ) : (
          <ClientPresencePanel
            panelKey={SINGLE_AVATAR_KEY}
            avatarEntry={avatarEntry}
            presenceLabel={presenceLabel}
            onReady={handleAvatarReady}
          />
        ))}

      {showRoom && sceneParticipants.length > 0 && (
        <TherapyScene
          participants={sceneParticipants}
          onReady={handleAvatarReady}
          playingSpeaker={playingSpeaker}
        />
      )}

      <div className="relative min-h-[420px] rounded-lg border border-slate-200 bg-slate-50 p-4">
        {simulationPaused && (
          <div className="absolute inset-0 z-10 flex items-start justify-center rounded-lg bg-slate-900/10 p-6 backdrop-blur-[1px]">
            <div className="rounded-lg border border-slate-300 bg-white px-4 py-3 shadow-sm">
              <p className="text-sm font-medium text-slate-900">Simulation paused</p>
              <p className="mt-1 text-sm text-slate-600">
                Client audio and voice capture are stopped. Click Resume to continue.
              </p>
            </div>
          </div>
        )}
        <div className="space-y-3">
          {practiceSession.messages.map((message) => {
            const accent = message.role === "CLIENT" ? speakerAccent(message.speaker) : null;
            const name = message.role === "CLIENT" ? speakerName(message.speaker) : null;
            return (
              <div
                key={message.id}
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  message.role === "THERAPIST"
                    ? "ml-auto bg-slate-900 text-white"
                    : `bg-white text-slate-900 shadow-sm ${accent ? `border-l-4 ${accent.border}` : ""}`
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p
                    className={`text-xs font-medium ${
                      message.role === "CLIENT" && accent ? accent.name : "opacity-70"
                    }`}
                  >
                    {message.role === "THERAPIST" ? "You (Therapist)" : name ?? "Client"}
                  </p>
                  {message.role === "CLIENT" &&
                    renderPlayButton(message.id, message.content, name ?? "client message", message.speaker)}
                </div>
                <p className="whitespace-pre-wrap">
                  {formatClientTextForDisplay(message.content)}
                </p>
              </div>
            );
          })}
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
          {voiceTurnActive && !sending && !transcribing && !simulationPaused && (
            <ListeningModeStatusBar
              mode={audioOutputMode}
              listening={listening || recording || clientSpeaking}
              clientSpeaking={clientSpeaking}
              micMuted={micPaused}
              onInterrupt={interruptClient}
            />
          )}
          {simulationPaused && (
            <div className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2.5">
              <p className="text-sm text-slate-700">
                <span className="font-medium">Paused.</span> Resume when you&apos;re ready to continue
                the session.
              </p>
            </div>
          )}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={inputPlaceholder}
              rows={3}
              className="field-input"
              disabled={sending || transcribing || recording || simulationPaused}
            />
          </div>
          {voiceTurnActive && listening && !recording && !transcribing && !sending && !simulationPaused && (
            <p className="text-sm text-emerald-700">Listening… speak when you&apos;re ready.</p>
          )}
          {voiceTurnActive && recording && !simulationPaused && (
            <p className="text-sm text-red-600">
              Recording… finish your thought naturally — we detect falling tone and pause to send.
            </p>
          )}
          {transcribing && (
            <p className="text-sm text-slate-600">Transcribing your response…</p>
          )}
          {sending && (
            <p className="text-sm text-slate-600">Sending your response…</p>
          )}
          {helpOpen && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/80 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-indigo-950">Supervisor suggestions</p>
                <button
                  type="button"
                  onClick={() => setHelpOpen(false)}
                  className="text-xs font-medium text-indigo-800 hover:text-indigo-950"
                >
                  Dismiss
                </button>
              </div>
              {helpLoading ? (
                <p className="mt-2 text-sm text-indigo-900">Loading suggestions…</p>
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-indigo-950">
                  {helpText}
                </p>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={sending || transcribing || recording || simulationPaused || !input.trim()}
              className="rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send response"}
            </button>
            <button
              type="button"
              onClick={handleTogglePause}
              disabled={ending || sending || transcribing}
              className="rounded-md border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {simulationPaused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              onClick={() => void handleGetHelp()}
              disabled={helpLoading || ending || sending}
              className="rounded-md border border-indigo-300 bg-indigo-50 px-4 py-2 text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
            >
              {helpLoading ? "Loading help…" : "Get help"}
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
    </div>
  );
}
