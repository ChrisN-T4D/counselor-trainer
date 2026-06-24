"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { AvatarController } from "@/components/practice/client-presence-panel";
import { moodFromClientText } from "@/lib/visual/delivery-tag-mood";
import type { PracticeViewMode } from "@/lib/visual/types";
import type { WordTimings } from "@/lib/visual/word-timings";
import type { EmotionVector } from "@/lib/affect/emotion";
import {
  EmotionStateController,
  type DisplayedAffect,
  type ReactionCue,
} from "@/lib/affect/emotion-state";
import type { ExpressivityProfile } from "@/lib/affect/expressivity-profile";
import { newTranscriptText, tagReaction } from "@/lib/affect/reaction-tagger";
import { ListeningController } from "@/components/practice/scene/listening-controller";
import { RealtimeSttSession } from "@/lib/voice/realtime-stt-client";
import { BackchannelPlayer } from "@/lib/voice/backchannel";
import {
  type AudioOutputMode,
  type AudioOutputModeHint,
  detectLikelyAudioOutputMode,
  loadAudioOutputMode,
  resolveDefaultAudioOutputMode,
  saveAudioOutputMode,
  shouldEnableVoiceBargeIn,
  shouldPauseMicDuringClient,
} from "@/lib/voice/audio-output-mode";
import { monitorVoiceActivity } from "@/lib/voice/voice-activity";

type VoiceStatus = {
  ttsEnabled: boolean;
  sttEnabled: boolean;
  sttRealtimeEnabled?: boolean;
  ttsError?: string;
  sttError?: string;
};

// Debounce window before acting on streaming partial transcripts.
const PARTIAL_DEBOUNCE_MS = 600;

// Dev-only: expose live felt vs displayed affect for the radar overlay.
const AFFECT_DEBUG = process.env.NEXT_PUBLIC_AFFECT_DEBUG === "1";

export type AffectDebug = {
  felt: EmotionVector;
  displayed: EmotionVector;
  arousal: number;
  rapport: number;
};

const POST_TTS_DELAY_MS = 350;
const MAX_UTTERANCE_MS = 120_000;

/** Decode the base64 word-timing header returned by /api/tts (for avatar lip-sync). */
function parseWordTimingsHeader(header: string | null): WordTimings | undefined {
  if (!header) {
    return undefined;
  }
  try {
    const json = atob(header);
    const parsed = JSON.parse(json) as WordTimings;
    if (Array.isArray(parsed.words) && parsed.words.length > 0) {
      return parsed;
    }
  } catch {
    // Ignore malformed header; lip-sync falls back to estimation.
  }
  return undefined;
}

export type ClientUtterance = {
  id: string;
  text: string;
  speaker?: string | null;
};

/** The affect payload streamed from the /turn route (the LLM reply's felt state). */
export type ClientAffectUpdate = {
  felt: EmotionVector;
  arousal: number;
  rapport: number;
  cues: ReactionCue[];
  profile: ExpressivityProfile;
};

// How often the client-side emotion integrator decays toward baseline + repaints.
const AFFECT_TICK_MS = 150;

type UsePracticeVoiceOptions = {
  viewMode?: PracticeViewMode;
  visualEnabled?: boolean;
  avatarControllerRef?: RefObject<AvatarController | null>;
};

export function usePracticeVoice(sessionId: string, options: UsePracticeVoiceOptions = {}) {
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>({
    ttsEnabled: false,
    sttEnabled: false,
  });
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [loadingPlayId, setLoadingPlayId] = useState<string | null>(null);
  const [audioOutputMode, setAudioOutputModeState] = useState<AudioOutputMode>("speakers");
  const [audioOutputModeHint, setAudioOutputModeHint] = useState<AudioOutputModeHint | null>(null);
  const [recording, setRecording] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [turnPaused, setTurnPaused] = useState(false);
  const [simulationPaused, setSimulationPaused] = useState(false);
  const [affectDebug, setAffectDebug] = useState<AffectDebug | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const audioEndResolveRef = useRef<(() => void) | null>(null);
  const playbackTokenRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const transcribeResolverRef = useRef<((text: string | null) => void) | null>(null);
  const audioOutputModeRef = useRef<AudioOutputMode>("speakers");
  const vadStopRef = useRef<(() => void) | null>(null);
  const postTtsTimerRef = useRef<number | null>(null);
  const maxUtteranceTimerRef = useRef<number | null>(null);
  const sessionActiveRef = useRef(false);
  const playingMessageIdRef = useRef<string | null>(null);
  const turnPausedRef = useRef(false);
  const simulationPausedRef = useRef(false);
  const onAutoSendRef = useRef<((text: string) => void | Promise<void>) | null>(null);
  const emotionRef = useRef<EmotionStateController | null>(null);
  const affectIntervalRef = useRef<number | null>(null);
  const listeningCtrlRef = useRef<ListeningController | null>(null);
  const lastLevelAtRef = useRef(0);
  const realtimeSttRef = useRef<RealtimeSttSession | null>(null);
  const partialDebounceRef = useRef<number | null>(null);
  const lastTaggedPartialRef = useRef("");
  const tagPartialForReactionsRef = useRef<((text: string) => void) | null>(null);
  const backchannelRef = useRef<BackchannelPlayer | null>(null);
  const voiceStatusRef = useRef(voiceStatus);
  const viewModeRef = useRef(options.viewMode ?? "text");
  const visualEnabledRef = useRef(options.visualEnabled ?? false);
  const avatarControllerRef = options.avatarControllerRef;

  useEffect(() => {
    viewModeRef.current = options.viewMode ?? "text";
  }, [options.viewMode]);

  useEffect(() => {
    visualEnabledRef.current = options.visualEnabled ?? false;
  }, [options.visualEnabled]);

  const voiceTurnActive = voiceStatus.sttEnabled;
  const clientSpeaking = playingMessageId !== null;
  const micPaused =
    voiceTurnActive &&
    (simulationPaused ||
      turnPaused ||
      (clientSpeaking && shouldPauseMicDuringClient(audioOutputMode)));

  const clearPostTtsTimer = useCallback(() => {
    if (postTtsTimerRef.current !== null) {
      window.clearTimeout(postTtsTimerRef.current);
      postTtsTimerRef.current = null;
    }
  }, []);

  const clearMaxUtteranceTimer = useCallback(() => {
    if (maxUtteranceTimerRef.current !== null) {
      window.clearTimeout(maxUtteranceTimerRef.current);
      maxUtteranceTimerRef.current = null;
    }
  }, []);

  const stopVad = useCallback(() => {
    vadStopRef.current?.();
    vadStopRef.current = null;
    listeningCtrlRef.current?.stop();
    if (partialDebounceRef.current !== null) {
      window.clearTimeout(partialDebounceRef.current);
      partialDebounceRef.current = null;
    }
    realtimeSttRef.current?.stop();
    realtimeSttRef.current = null;
  }, []);

  // Push the integrator's displayed affect to the active avatar handle.
  const pushDisplayedAffect = useCallback(
    (displayed: DisplayedAffect) => {
      const handle = avatarControllerRef?.current?.getHandle(null) ?? null;
      handle?.setAffect?.(displayed.vector, displayed.arousal, displayed.rapport);
      if (AFFECT_DEBUG && emotionRef.current) {
        setAffectDebug({
          felt: emotionRef.current.getState().felt,
          displayed: displayed.vector,
          arousal: displayed.arousal,
          rapport: displayed.rapport,
        });
      }
    },
    [avatarControllerRef],
  );

  const stopAffectLoop = useCallback(() => {
    if (affectIntervalRef.current !== null) {
      window.clearInterval(affectIntervalRef.current);
      affectIntervalRef.current = null;
    }
  }, []);

  // Decay felt emotion toward baseline on a steady tick (independent of the 3D
  // rAF) so the face keeps relaxing between turns even while the trainee speaks.
  const startAffectLoop = useCallback(() => {
    if (affectIntervalRef.current !== null) return;
    let last = performance.now();
    affectIntervalRef.current = window.setInterval(() => {
      const controller = emotionRef.current;
      if (!controller) return;
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      controller.update(dt);
    }, AFFECT_TICK_MS);
  }, []);

  const ensureListeningController = useCallback((): ListeningController => {
    if (!backchannelRef.current) backchannelRef.current = new BackchannelPlayer();
    if (!listeningCtrlRef.current) {
      listeningCtrlRef.current = new ListeningController({
        onArousalNudge: (delta) => emotionRef.current?.nudgeArousal(delta),
        onNod: () => {
          const handle = avatarControllerRef?.current?.getHandle(null) ?? null;
          handle?.triggerReaction?.("nod");
          // Pause-aligned (onNod fires on a speech falling edge), rate-limited,
          // and never while the client is the one speaking.
          if (playingMessageIdRef.current === null) backchannelRef.current?.play();
        },
      });
    }
    return listeningCtrlRef.current;
  }, [avatarControllerRef]);

  const stopRealtimeStt = useCallback(() => {
    if (partialDebounceRef.current !== null) {
      window.clearTimeout(partialDebounceRef.current);
      partialDebounceRef.current = null;
    }
    realtimeSttRef.current?.stop();
    realtimeSttRef.current = null;
    lastTaggedPartialRef.current = "";
  }, []);

  // Debounced consumer for streaming partial transcripts. The semantic reaction
  // tagging (lexicon -> appraisal/cues) is applied in `tagPartialForReactions`.
  const handleRealtimePartial = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (partialDebounceRef.current !== null) window.clearTimeout(partialDebounceRef.current);
    partialDebounceRef.current = window.setTimeout(() => {
      partialDebounceRef.current = null;
      const controller = emotionRef.current;
      if (!controller) return;
      tagPartialForReactionsRef.current?.(trimmed);
    }, PARTIAL_DEBOUNCE_MS);
  }, []);

  /** Fold a reply's reported affect into the client emotion state + fire reactions. */
  const applyClientAffect = useCallback(
    (update: ClientAffectUpdate) => {
      const state = { felt: update.felt, arousal: update.arousal, rapport: update.rapport };
      let controller = emotionRef.current;
      if (!controller) {
        controller = new EmotionStateController({
          profile: update.profile,
          initial: state,
          onDisplayChange: pushDisplayedAffect,
        });
        emotionRef.current = controller;
        startAffectLoop();
      } else {
        controller.setProfile(update.profile);
        controller.loadState(state);
      }

      if (update.cues.length > 0) {
        const handle = avatarControllerRef?.current?.getHandle(null) ?? null;
        for (const cue of update.cues) handle?.triggerReaction?.(cue);
      }
    },
    [avatarControllerRef, pushDisplayedAffect, startAffectLoop],
  );

  const stopPlayback = useCallback(() => {
    // Invalidate any in-flight playback sequence (couples turns play segments serially).
    playbackTokenRef.current += 1;
    avatarControllerRef?.current?.stopAll();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    // Unblock a pending audio-path awaiter so sequence loops can exit.
    if (audioEndResolveRef.current) {
      const resolve = audioEndResolveRef.current;
      audioEndResolveRef.current = null;
      resolve();
    }
    setPlayingMessageId(null);
  }, [avatarControllerRef]);

  useEffect(() => {
    playingMessageIdRef.current = playingMessageId;
  }, [playingMessageId]);

  useEffect(() => {
    turnPausedRef.current = turnPaused;
  }, [turnPaused]);

  useEffect(() => {
    simulationPausedRef.current = simulationPaused;
  }, [simulationPaused]);

  const setAudioOutputMode = useCallback((mode: AudioOutputMode) => {
    audioOutputModeRef.current = mode;
    setAudioOutputModeState(mode);
    setAudioOutputModeHint("saved");
    saveAudioOutputMode(mode);
  }, []);

  const releaseMic = useCallback(() => {
    stopVad();
    clearPostTtsTimer();
    clearMaxUtteranceTimer();

    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
    mediaRecorderRef.current = null;

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    setListening(false);
  }, [clearMaxUtteranceTimer, clearPostTtsTimer, stopVad]);

  const transcribeBlob = useCallback(async (blob: Blob): Promise<string | null> => {
    setTranscribing(true);
    try {
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");

      const response = await fetch("/api/stt", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not transcribe audio");
      }

      const data = (await response.json()) as { text: string };
      return data.text.trim() || null;
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : "Could not transcribe audio");
      return null;
    } finally {
      setTranscribing(false);
    }
  }, []);

  const finishRecorder = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return null;
    }

    return new Promise<string | null>((resolve) => {
      transcribeResolverRef.current = resolve;
      recorder.stop();
    });
  }, []);

  const ensureMicStream = useCallback(async (): Promise<MediaStream | null> => {
    if (mediaStreamRef.current?.active) {
      return mediaStreamRef.current;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      return stream;
    } catch (error) {
      setVoiceError(
        error instanceof Error ? error.message : "Microphone access was denied or unavailable",
      );
      return null;
    }
  }, []);

  const startSpeechRecorder = useCallback(async () => {
    if (mediaRecorderRef.current?.state === "recording") {
      return;
    }

    const stream = await ensureMicStream();
    if (!stream) {
      return;
    }

    setVoiceError(null);
    chunksRef.current = [];

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = async () => {
      clearMaxUtteranceTimer();
      setRecording(false);

      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType });
      chunksRef.current = [];
      mediaRecorderRef.current = null;

      const text = blob.size > 0 ? await transcribeBlob(blob) : null;
      transcribeResolverRef.current?.(text);
      transcribeResolverRef.current = null;
    };

    recorder.start();
    setRecording(true);

    clearMaxUtteranceTimer();
    maxUtteranceTimerRef.current = window.setTimeout(() => {
      void finishRecorder();
    }, MAX_UTTERANCE_MS);
  }, [clearMaxUtteranceTimer, ensureMicStream, finishRecorder, transcribeBlob]);

  const pauseVoiceTurn = useCallback(() => {
    stopVad();
    clearPostTtsTimer();
    if (mediaRecorderRef.current?.state === "recording") {
      void finishRecorder();
    }
    setListening(false);
  }, [clearPostTtsTimer, finishRecorder, stopVad]);

  const canAutoListen = useCallback(() => {
    return (
      sessionActiveRef.current &&
      voiceStatusRef.current.sttEnabled &&
      !turnPausedRef.current &&
      !simulationPausedRef.current &&
      playingMessageIdRef.current === null
    );
  }, []);

  const resumeVoiceTurn = useCallback(async () => {
    if (!canAutoListen()) {
      return;
    }

    const stream = await ensureMicStream();
    if (!stream) {
      return;
    }

    stopVad();
    setListening(true);
    setVoiceError(null);

    // The client listens while the trainee speaks: nods at pauses + tracks energy.
    const listener = ensureListeningController();
    listener.start();
    lastLevelAtRef.current = performance.now();

    // Realtime STT (optional): stream mic PCM for mid-utterance reactions. The
    // batch /api/stt path still produces the authoritative final transcript.
    if (voiceStatusRef.current.sttRealtimeEnabled && emotionRef.current) {
      stopRealtimeStt();
      const realtime = new RealtimeSttSession({
        onPartial: handleRealtimePartial,
        onError: () => stopRealtimeStt(),
      });
      realtimeSttRef.current = realtime;
      void realtime.start(stream).catch(() => stopRealtimeStt());
    }

    vadStopRef.current = monitorVoiceActivity(stream, {
      onLevel: (rms) => {
        const now = performance.now();
        const dt = (now - lastLevelAtRef.current) / 1000;
        lastLevelAtRef.current = now;
        listener.feedLevel(rms, dt);
      },
      onSpeechStart: () => {
        void startSpeechRecorder();
      },
      onSpeechEnd: () => {
        void (async () => {
          listener.stop();
          stopRealtimeStt();
          const text = await finishRecorder();
          stopVad();
          setListening(false);

          if (text && !simulationPausedRef.current && !turnPausedRef.current) {
            await onAutoSendRef.current?.(text);
          } else if (canAutoListen()) {
            void resumeVoiceTurn();
          }
        })();
      },
    });
  }, [
    canAutoListen,
    ensureListeningController,
    ensureMicStream,
    finishRecorder,
    handleRealtimePartial,
    startSpeechRecorder,
    stopRealtimeStt,
    stopVad,
  ]);

  const scheduleVoiceTurn = useCallback(() => {
    if (!voiceStatusRef.current.sttEnabled || simulationPausedRef.current) {
      return;
    }

    turnPausedRef.current = false;
    setTurnPaused(false);
    clearPostTtsTimer();
    postTtsTimerRef.current = window.setTimeout(() => {
      void resumeVoiceTurn();
    }, POST_TTS_DELAY_MS);
  }, [clearPostTtsTimer, resumeVoiceTurn]);

  const startBargeInMonitor = useCallback(async () => {
    if (!shouldEnableVoiceBargeIn(audioOutputModeRef.current) || simulationPausedRef.current) {
      return;
    }

    const stream = await ensureMicStream();
    if (!stream) {
      return;
    }

    stopVad();
    setListening(true);

    vadStopRef.current = monitorVoiceActivity(stream, {
      onSpeechStart: () => {
        stopPlayback();
        stopVad();
        setListening(false);
        scheduleVoiceTurn();
      },
    });
  }, [ensureMicStream, scheduleVoiceTurn, stopPlayback, stopVad]);

  const interruptClient = useCallback(() => {
    stopPlayback();
    scheduleVoiceTurn();
  }, [scheduleVoiceTurn, stopPlayback]);

  const pauseSimulation = useCallback(() => {
    simulationPausedRef.current = true;
    setSimulationPaused(true);
    turnPausedRef.current = true;
    setTurnPaused(true);
    stopPlayback();
    pauseVoiceTurn();
  }, [pauseVoiceTurn, stopPlayback]);

  const resumeSimulation = useCallback(() => {
    simulationPausedRef.current = false;
    setSimulationPaused(false);
    if (!sessionActiveRef.current) {
      return;
    }

    turnPausedRef.current = false;
    setTurnPaused(false);

    if (playingMessageIdRef.current !== null) {
      return;
    }

    scheduleVoiceTurn();
  }, [scheduleVoiceTurn]);

  const setOnAutoSend = useCallback((handler: ((text: string) => void | Promise<void>) | null) => {
    onAutoSendRef.current = handler;
  }, []);

  const setSessionActive = useCallback(
    (active: boolean) => {
      sessionActiveRef.current = active;
      if (!active) {
        stopPlayback();
        turnPausedRef.current = true;
        setTurnPaused(true);
        releaseMic();
        stopAffectLoop();
        stopRealtimeStt();
        emotionRef.current = null;
      }
    },
    [releaseMic, stopAffectLoop, stopRealtimeStt, stopPlayback],
  );

  useEffect(() => {
    voiceStatusRef.current = voiceStatus;
  }, [voiceStatus]);

  useEffect(() => {
    async function loadVoiceStatus() {
      const response = await fetch("/api/voice/status");
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as VoiceStatus;
      setVoiceStatus(data);
      if (data.ttsError) {
        setVoiceError(data.ttsError);
      } else if (data.sttError) {
        setVoiceError(data.sttError);
      }
    }

    loadVoiceStatus();
  }, []);

  useEffect(() => {
    const stored = loadAudioOutputMode();
    if (stored) {
      audioOutputModeRef.current = stored;
      setAudioOutputModeState(stored);
      setAudioOutputModeHint("saved");
      return;
    }

    void detectLikelyAudioOutputMode().then((detected) => {
      const mode = resolveDefaultAudioOutputMode(detected);
      audioOutputModeRef.current = mode;
      setAudioOutputModeState(mode);
      setAudioOutputModeHint(detected ? "detected" : "default");
    });
  }, []);

  useEffect(() => {
    if (simulationPausedRef.current || !sessionActiveRef.current || !voiceStatusRef.current.sttEnabled) {
      return;
    }

    pauseVoiceTurn();

    if (playingMessageIdRef.current !== null) {
      if (shouldEnableVoiceBargeIn(audioOutputModeRef.current)) {
        void startBargeInMonitor();
      }
      return;
    }

    if (!turnPausedRef.current) {
      scheduleVoiceTurn();
    }
  }, [audioOutputMode, pauseVoiceTurn, scheduleVoiceTurn, startBargeInMonitor]);

  useEffect(() => {
    return () => {
      stopPlayback();
      releaseMic();
      stopAffectLoop();
      stopRealtimeStt();
    };
  }, [releaseMic, stopAffectLoop, stopPlayback, stopRealtimeStt]);

  // Wire the semantic reaction tagger: appraise newly-heard speech, fold it into
  // the emotion state, and fire reaction cues gated by the client's reactivity +
  // rapport (a guarded client reacts less; a warm one reacts more).
  useEffect(() => {
    tagPartialForReactionsRef.current = (text: string) => {
      const controller = emotionRef.current;
      if (!controller) return;

      const fresh = newTranscriptText(lastTaggedPartialRef.current, text);
      lastTaggedPartialRef.current = text;

      const result = tagReaction(fresh);
      if (!result) return;

      controller.applyAppraisal(result.delta);

      if (result.cues.length === 0) return;
      const profile = controller.getProfile();
      const rapport = controller.getState().rapport;
      const fireProbability = Math.min(1, profile.reactivity * (0.4 + rapport * 0.6));
      const handle = avatarControllerRef?.current?.getHandle(null) ?? null;
      for (const cue of result.cues) {
        if (Math.random() <= fireProbability) handle?.triggerReaction?.(cue);
      }
    };
    return () => {
      tagPartialForReactionsRef.current = null;
    };
  }, [avatarControllerRef]);

  // Synthesize and play one utterance, routing the voice + avatar to its speaker.
  // Resolves when playback finishes (or is interrupted via stopPlayback).
  const speakUtterance = useCallback(
    async (messageId: string, text: string, speaker: string | null) => {
      setLoadingPlayId(messageId);
      try {
        const response = await fetch("/api/tts", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, sessionId, speaker: speaker ?? undefined }),
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          if (response.status === 401 && data.error === "Unauthorized") {
            throw new Error("Your session expired. Refresh the page and sign in again.");
          }
          throw new Error(data.error ?? "Could not play client voice");
        }

        const wordTimings = parseWordTimingsHeader(response.headers.get("X-Tts-Word-Timings"));
        const blob = await response.blob();
        const handle = avatarControllerRef?.current?.getHandle(speaker) ?? null;
        const useAvatarPlayback =
          visualEnabledRef.current &&
          (viewModeRef.current === "avatar" || viewModeRef.current === "room") &&
          handle?.isReady();

        setPlayingMessageId(messageId);

        if (useAvatarPlayback && handle) {
          await handle.speak(blob, text, moodFromClientText(text), wordTimings);
          return;
        }

        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;

        await new Promise<void>((resolve) => {
          audioEndResolveRef.current = resolve;
          audio.onended = () => {
            audioEndResolveRef.current = null;
            resolve();
          };
          audio.onerror = () => {
            setVoiceError("Audio playback failed");
            audioEndResolveRef.current = null;
            resolve();
          };
          void audio.play().catch(() => {
            audioEndResolveRef.current = null;
            resolve();
          });
        });
      } finally {
        setLoadingPlayId(null);
      }
    },
    [avatarControllerRef, sessionId],
  );

  const playClientMessages = useCallback(
    async (utterances: ClientUtterance[]) => {
      const items = utterances.filter((item) => item.text.trim());
      if (!voiceStatus.ttsEnabled || items.length === 0 || simulationPausedRef.current) {
        return;
      }

      pauseVoiceTurn();
      stopPlayback();
      setVoiceError(null);

      const token = playbackTokenRef.current;

      if (shouldEnableVoiceBargeIn(audioOutputModeRef.current)) {
        void startBargeInMonitor();
      }

      try {
        for (const item of items) {
          if (playbackTokenRef.current !== token) {
            break;
          }
          await speakUtterance(item.id, item.text, item.speaker ?? null);
        }
      } catch (error) {
        setVoiceError(error instanceof Error ? error.message : "Could not play client voice");
      } finally {
        if (playbackTokenRef.current === token) {
          stopPlayback();
          stopVad();
          scheduleVoiceTurn();
        }
      }
    },
    [
      pauseVoiceTurn,
      scheduleVoiceTurn,
      speakUtterance,
      startBargeInMonitor,
      stopPlayback,
      stopVad,
      voiceStatus.ttsEnabled,
    ],
  );

  const playClientMessage = useCallback(
    async (messageId: string, text: string, speaker: string | null = null) => {
      if (!voiceStatus.ttsEnabled || !text.trim() || simulationPausedRef.current) {
        return;
      }

      if (playingMessageId === messageId) {
        interruptClient();
        return;
      }

      await playClientMessages([{ id: messageId, text, speaker }]);
    },
    [interruptClient, playClientMessages, playingMessageId, voiceStatus.ttsEnabled],
  );

  const beginVoiceTurn = useCallback(() => {
    if (!voiceTurnActive || !sessionActiveRef.current || simulationPausedRef.current) {
      return;
    }
    scheduleVoiceTurn();
  }, [scheduleVoiceTurn, voiceTurnActive]);

  const pauseVoiceTurnForSend = useCallback(() => {
    turnPausedRef.current = true;
    setTurnPaused(true);
    pauseVoiceTurn();
  }, [pauseVoiceTurn]);

  const resumeVoiceTurnAfterSend = useCallback(() => {
    if (simulationPausedRef.current) {
      return;
    }

    turnPausedRef.current = false;
    setTurnPaused(false);
    if (voiceStatusRef.current.ttsEnabled) {
      return;
    }
    scheduleVoiceTurn();
  }, [scheduleVoiceTurn]);

  return {
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
    affectDebugEnabled: AFFECT_DEBUG,
  };
}
