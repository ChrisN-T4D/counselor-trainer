"use client";

import { AudioFormat, CommitStrategy, RealtimeEvents, Scribe } from "@elevenlabs/client";
import type { RealtimeConnection } from "@elevenlabs/client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AudioOutputMode,
  type AudioOutputModeHint,
  detectLikelyAudioOutputMode,
  loadAudioOutputMode,
  looksLikeBargeInSpeech,
  resolveDefaultAudioOutputMode,
  saveAudioOutputMode,
  shouldEnableVoiceBargeIn,
} from "@/lib/voice/audio-output-mode";

import { startMicActivityMonitor } from "@/lib/voice/mic-activity-monitor";
import {
  requestMicrophoneStream,
  prepareScribeMicrophoneStream,
  type ScribeMicrophoneStream,
} from "@/lib/voice/scribe-microphone-stream";
import { formatScribeRealtimeError } from "@/lib/voice/scribe-errors";

type VoiceStatus = {
  ttsEnabled: boolean;
  sttEnabled: boolean;
  sttRealtime?: boolean;
  scribeTokenOk?: boolean;
  scribeError?: string;
};

export type MicPermissionState = "unknown" | "prompt" | "granted" | "denied";

export type MutedSpeechPromptState = {
  visible: boolean;
  clientSpeaking: boolean;
};

const MUTED_SPEECH_COOLDOWN_MS = 12_000;
const SCRIBE_CONNECT_TIMEOUT_MS = 15_000;

function buildLiveTranscript(base: string, committed: string[], partial: string): string {
  const segments = [
    ...(base.trim() ? [base.trim()] : []),
    ...committed,
    ...(partial.trim() ? [partial.trim()] : []),
  ];
  return segments.join(" ");
}

export function usePracticeVoice(sessionId: string) {
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>({
    ttsEnabled: false,
    sttEnabled: false,
    sttRealtime: false,
  });
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [loadingPlayId, setLoadingPlayId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [connectingMic, setConnectingMic] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [micPermission, setMicPermission] = useState<MicPermissionState>("unknown");
  const [audioOutputMode, setAudioOutputModeState] = useState<AudioOutputMode>("speakers");
  const [audioOutputModeHint, setAudioOutputModeHint] = useState<AudioOutputModeHint | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [mutedSpeechPrompt, setMutedSpeechPrompt] = useState<MutedSpeechPromptState>({
    visible: false,
    clientSpeaking: false,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const transcribeResolverRef = useRef<((text: string | null) => void) | null>(null);

  const scribeConnectionRef = useRef<RealtimeConnection | null>(null);
  const baseInputRef = useRef("");
  const committedSegmentsRef = useRef<string[]>([]);
  const partialTranscriptRef = useRef("");
  const inputGetterRef = useRef<() => string>(() => "");
  const onLiveTranscriptRef = useRef<((text: string) => void) | null>(null);
  const sessionActiveRef = useRef(false);
  const userMutedRef = useRef(false);
  const playbackSuppressedRef = useRef(false);
  const clientPlayingRef = useRef(false);
  const audioOutputModeRef = useRef<AudioOutputMode>("speakers");
  const startInFlightRef = useRef(false);
  const activityMonitorRef = useRef<Awaited<ReturnType<typeof startMicActivityMonitor>> | null>(
    null,
  );
  const mutedSpeechCooldownUntilRef = useRef(0);
  const mutedSpeechPromptVisibleRef = useRef(false);
  const scribeSessionReadyRef = useRef(false);
  const scribeAutoConnectRef = useRef(true);
  const scribeConnectTimeoutRef = useRef<number | null>(null);
  const scribeMicStreamRef = useRef<ScribeMicrophoneStream | null>(null);
  const scribeSuppressCloseErrorRef = useRef(false);
  const scribeFailureReportedRef = useRef(false);

  const dismissMutedSpeechPrompt = useCallback(() => {
    mutedSpeechPromptVisibleRef.current = false;
    mutedSpeechCooldownUntilRef.current = Date.now() + MUTED_SPEECH_COOLDOWN_MS;
    setMutedSpeechPrompt({ visible: false, clientSpeaking: false });
  }, []);

  const showMutedSpeechPrompt = useCallback(() => {
    if (mutedSpeechPromptVisibleRef.current) {
      return;
    }
    if (Date.now() < mutedSpeechCooldownUntilRef.current) {
      return;
    }
    if (!userMutedRef.current && !playbackSuppressedRef.current) {
      return;
    }

    mutedSpeechPromptVisibleRef.current = true;
    setMutedSpeechPrompt({
      visible: true,
      clientSpeaking: clientPlayingRef.current,
    });
  }, []);

  const syncMicMuteState = useCallback(() => {
    const shouldMute = userMutedRef.current || playbackSuppressedRef.current;

    if (!scribeMicStreamRef.current || !listening) {
      setMicMuted(shouldMute);
      return;
    }

    try {
      scribeMicStreamRef.current.setTrackEnabled(!shouldMute);
      setMicMuted(shouldMute);
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : "Could not change microphone mute state");
    }
  }, [listening]);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    clientPlayingRef.current = false;
    setPlayingMessageId(null);
    playbackSuppressedRef.current = false;
    syncMicMuteState();
  }, [syncMicMuteState]);

  const pushLiveTranscript = useCallback(() => {
    onLiveTranscriptRef.current?.(
      buildLiveTranscript(
        baseInputRef.current,
        committedSegmentsRef.current,
        partialTranscriptRef.current,
      ),
    );
  }, []);

  const maybeBargeInOnSpeech = useCallback(
    (text: string) => {
      if (
        !clientPlayingRef.current ||
        !shouldEnableVoiceBargeIn(audioOutputModeRef.current) ||
        !looksLikeBargeInSpeech(text)
      ) {
        return;
      }

      stopPlayback();
    },
    [stopPlayback],
  );

  const beginClientPlaybackSuppression = useCallback(() => {
    clientPlayingRef.current = true;

    if (audioOutputModeRef.current === "speakers") {
      playbackSuppressedRef.current = true;
      syncMicMuteState();
    }
  }, [syncMicMuteState]);

  const stopRealtimeListening = useCallback((options?: { intentional?: boolean }) => {
    scribeSuppressCloseErrorRef.current = options?.intentional ?? false;
    if (scribeConnectTimeoutRef.current !== null) {
      window.clearTimeout(scribeConnectTimeoutRef.current);
      scribeConnectTimeoutRef.current = null;
    }
    scribeMicStreamRef.current?.cleanup();
    scribeMicStreamRef.current = null;
    scribeConnectionRef.current?.close();
    scribeConnectionRef.current = null;
    partialTranscriptRef.current = "";
    scribeSessionReadyRef.current = false;
    setListening(false);
    userMutedRef.current = false;
    playbackSuppressedRef.current = false;
    setMicMuted(false);
    scribeSuppressCloseErrorRef.current = false;
  }, []);

  const blockScribeAutoConnect = useCallback((message?: string) => {
    scribeAutoConnectRef.current = false;
    if (message) {
      setVoiceError(message);
    }
  }, []);

  const reportScribeFailure = useCallback(
    (message: string) => {
      if (scribeFailureReportedRef.current) {
        return;
      }
      scribeFailureReportedRef.current = true;
      blockScribeAutoConnect(message);
    },
    [blockScribeAutoConnect],
  );

  const allowScribeAutoConnect = useCallback(() => {
    scribeAutoConnectRef.current = true;
  }, []);

  const syncTranscriptBase = useCallback((text: string) => {
    baseInputRef.current = text;
    committedSegmentsRef.current = [];
    partialTranscriptRef.current = "";
  }, []);

  const prepareForSend = useCallback(() => {
    baseInputRef.current = "";
    committedSegmentsRef.current = [];
    partialTranscriptRef.current = "";
    pushLiveTranscript();
  }, [pushLiveTranscript]);

  const setAudioOutputMode = useCallback(
    (mode: AudioOutputMode) => {
      audioOutputModeRef.current = mode;
      setAudioOutputModeState(mode);
      setAudioOutputModeHint("saved");
      saveAudioOutputMode(mode);

      if (clientPlayingRef.current && mode === "speakers") {
        playbackSuppressedRef.current = true;
      } else if (mode === "headphones" && !userMutedRef.current) {
        playbackSuppressedRef.current = false;
      }

      syncMicMuteState();
    },
    [syncMicMuteState],
  );

  const interruptClient = useCallback(() => {
    if (!clientPlayingRef.current) {
      return;
    }

    stopPlayback();
    userMutedRef.current = false;
    syncMicMuteState();
  }, [stopPlayback, syncMicMuteState]);

  const confirmTryToSpeak = useCallback(() => {
    dismissMutedSpeechPrompt();

    if (clientPlayingRef.current && playbackSuppressedRef.current) {
      interruptClient();
      return;
    }

    userMutedRef.current = false;
    syncMicMuteState();
  }, [dismissMutedSpeechPrompt, interruptClient, syncMicMuteState]);

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

  const startRealtimeListening = useCallback(async () => {
    if (startInFlightRef.current || listening || !onLiveTranscriptRef.current) {
      return;
    }

    startInFlightRef.current = true;
    setConnectingMic(true);
    setVoiceError(null);
    if (scribeConnectionRef.current) {
      scribeConnectionRef.current.close();
      scribeConnectionRef.current = null;
    }
    if (scribeConnectTimeoutRef.current !== null) {
      window.clearTimeout(scribeConnectTimeoutRef.current);
      scribeConnectTimeoutRef.current = null;
    }
    baseInputRef.current = inputGetterRef.current();
    committedSegmentsRef.current = [];
    partialTranscriptRef.current = "";
    userMutedRef.current = false;
    playbackSuppressedRef.current = clientPlayingRef.current && audioOutputModeRef.current === "speakers";
    scribeSessionReadyRef.current = false;
    scribeFailureReportedRef.current = false;

    let connection: RealtimeConnection | null = null;
    let rejectSessionReady: ((reason: Error) => void) | null = null;
    let micStream: MediaStream | null = null;
    let preparedMic: Awaited<ReturnType<typeof prepareScribeMicrophoneStream>> | null = null;
    let micPipelinePromise: ReturnType<typeof prepareScribeMicrophoneStream> | null = null;

    try {
      micStream = await requestMicrophoneStream();
      setMicPermission("granted");

      micPipelinePromise = prepareScribeMicrophoneStream(micStream);

      const tokenResponse = await fetch("/api/stt/scribe-token");
      if (!tokenResponse.ok) {
        const data = (await tokenResponse.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not start live transcription");
      }

      const { token, modelId } = (await tokenResponse.json()) as {
        token: string;
        modelId: string;
      };

      preparedMic = await micPipelinePromise;

      connection = Scribe.connect({
        token,
        modelId,
        commitStrategy: CommitStrategy.VAD,
        vadSilenceThresholdSecs: 1.2,
        audioFormat: AudioFormat.PCM_16000,
        sampleRate: 16000,
      });

      scribeConnectionRef.current = connection;

      const sessionReadyPromise = new Promise<void>((resolve, reject) => {
        rejectSessionReady = reject;
        let settled = false;
        const settle = (action: () => void) => {
          if (settled) {
            return;
          }
          settled = true;
          rejectSessionReady = null;
          if (scribeConnectTimeoutRef.current !== null) {
            window.clearTimeout(scribeConnectTimeoutRef.current);
            scribeConnectTimeoutRef.current = null;
          }
          action();
        };

        scribeConnectTimeoutRef.current = window.setTimeout(() => {
          settle(() => reject(new Error("Timed out waiting for live transcription to start")));
        }, SCRIBE_CONNECT_TIMEOUT_MS);

        connection!.on(RealtimeEvents.SESSION_STARTED, () => {
          scribeSessionReadyRef.current = true;
          pushLiveTranscript();
          settle(resolve);
        });

        connection!.on(RealtimeEvents.UNACCEPTED_TERMS, (data) => {
          settle(() => reject(new Error(formatScribeRealtimeError(data))));
        });

        connection!.on(RealtimeEvents.AUTH_ERROR, (data) => {
          settle(() => reject(new Error(formatScribeRealtimeError(data))));
        });
      });

      connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (data) => {
        partialTranscriptRef.current = data.text;
        maybeBargeInOnSpeech(data.text);
        pushLiveTranscript();
      });

      connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (data) => {
        const text = data.text.trim();
        if (text) {
          maybeBargeInOnSpeech(text);
          committedSegmentsRef.current.push(text);
        }
        partialTranscriptRef.current = "";
        pushLiveTranscript();
      });

      connection.on(RealtimeEvents.ERROR, (data) => {
        reportScribeFailure(formatScribeRealtimeError(data));
        stopRealtimeListening({ intentional: true });
      });

      connection.on(RealtimeEvents.CLOSE, () => {
        if (scribeConnectionRef.current !== connection) {
          return;
        }

        const hadSession = scribeSessionReadyRef.current;
        if (!hadSession && rejectSessionReady) {
          rejectSessionReady(
            new Error("Live transcription connection closed before it finished starting"),
          );
          rejectSessionReady = null;
        }

        const suppressError = scribeSuppressCloseErrorRef.current || scribeFailureReportedRef.current;
        stopRealtimeListening({ intentional: true });

        if (suppressError) {
          return;
        }

        reportScribeFailure(
          hadSession
            ? "Live transcription disconnected. Click Reconnect microphone to try again."
            : "Could not connect live transcription. Check ElevenLabs voice settings and try reconnecting.",
        );
      });

      await sessionReadyPromise;

      scribeMicStreamRef.current = preparedMic.attach(connection, () =>
        scribeConnectionRef.current === connection && scribeSessionReadyRef.current,
      );
      preparedMic = null;
      micStream = null;

      setListening(true);
      syncMicMuteState();

      if (!loadAudioOutputMode()) {
        void detectLikelyAudioOutputMode().then((detected) => {
          if (!detected) {
            return;
          }
          audioOutputModeRef.current = detected;
          setAudioOutputModeState(detected);
          setAudioOutputModeHint("detected");
          saveAudioOutputMode(detected);
        });
      }
    } catch (error) {
      preparedMic?.cleanup();
      void micPipelinePromise?.then((pipeline) => pipeline.cleanup()).catch(() => {});
      micStream?.getTracks().forEach((track) => track.stop());
      stopRealtimeListening({ intentional: true });

      const denied =
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "PermissionDeniedError");

      if (denied) {
        setMicPermission("denied");
      }

      reportScribeFailure(
        denied
          ? "Microphone access was denied. Allow microphone access in your browser to speak during the session."
          : formatScribeRealtimeError(error),
      );
    } finally {
      startInFlightRef.current = false;
      setConnectingMic(false);
    }
  }, [
    listening,
    maybeBargeInOnSpeech,
    pushLiveTranscript,
    reportScribeFailure,
    stopRealtimeListening,
    syncMicMuteState,
  ]);

  const requestMicAccess = useCallback(async () => {
    if (!voiceStatus.sttEnabled || !voiceStatus.sttRealtime) {
      return;
    }

    allowScribeAutoConnect();
    scribeFailureReportedRef.current = false;
    setVoiceError(null);
    await startRealtimeListening();
  }, [allowScribeAutoConnect, startRealtimeListening, voiceStatus.sttEnabled, voiceStatus.sttRealtime]);

  const tryStartOpenMic = useCallback(async () => {
    if (
      !voiceStatus.sttEnabled ||
      !voiceStatus.sttRealtime ||
      !sessionActiveRef.current ||
      !scribeAutoConnectRef.current ||
      micPermission !== "granted" ||
      listening ||
      connectingMic ||
      startInFlightRef.current
    ) {
      return;
    }

    await startRealtimeListening();
  }, [
    connectingMic,
    listening,
    micPermission,
    startRealtimeListening,
    voiceStatus.sttEnabled,
    voiceStatus.sttRealtime,
  ]);

  const bindTranscript = useCallback(
    (getInput: () => string, onLiveTranscript: (text: string) => void) => {
      inputGetterRef.current = getInput;
      onLiveTranscriptRef.current = onLiveTranscript;
    },
    [],
  );

  const setSessionActive = useCallback(
    (active: boolean) => {
      sessionActiveRef.current = active;
      if (!active) {
        stopRealtimeListening({ intentional: true });
        stopPlayback();
        allowScribeAutoConnect();
        return;
      }
      void tryStartOpenMic();
    },
    [allowScribeAutoConnect, stopPlayback, stopRealtimeListening, tryStartOpenMic],
  );

  const refreshMicPermission = useCallback(async () => {
    if (!voiceStatus.sttEnabled || !voiceStatus.sttRealtime) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setMicPermission("denied");
      setVoiceError("Microphone access is not supported in this browser.");
      return;
    }

    try {
      if (navigator.permissions?.query) {
        const status = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });
        if (status.state === "granted") {
          setMicPermission("granted");
        } else if (status.state === "denied") {
          setMicPermission("denied");
        } else {
          setMicPermission("prompt");
        }
        return;
      }
    } catch {
      // Permissions API unavailable or microphone name unsupported — fall through.
    }

    setMicPermission("prompt");
  }, [voiceStatus.sttEnabled, voiceStatus.sttRealtime]);

  useEffect(() => {
    async function loadVoiceStatus() {
      const response = await fetch("/api/voice/status");
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as VoiceStatus;
      setVoiceStatus(data);
      if (data.scribeTokenOk === false && data.scribeError) {
        setVoiceError(data.scribeError);
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
    if (voiceStatus.sttEnabled && voiceStatus.sttRealtime) {
      void refreshMicPermission();
    }
  }, [refreshMicPermission, voiceStatus.sttEnabled, voiceStatus.sttRealtime]);

  useEffect(() => {
    if (micPermission === "granted") {
      void tryStartOpenMic();
    }
  }, [micPermission, tryStartOpenMic, voiceStatus.sttEnabled, voiceStatus.sttRealtime]);

  useEffect(() => {
    if (!listening || !micMuted || !voiceStatus.sttRealtime) {
      activityMonitorRef.current?.stop();
      activityMonitorRef.current = null;
      return;
    }

    let cancelled = false;

    void startMicActivityMonitor({
      strict: () =>
        clientPlayingRef.current && audioOutputModeRef.current === "speakers",
      onSpeechDetected: () => {
        if (!cancelled) {
          showMutedSpeechPrompt();
        }
      },
    })
      .then((monitor) => {
        if (cancelled) {
          monitor.stop();
          return;
        }
        activityMonitorRef.current?.stop();
        activityMonitorRef.current = monitor;
      })
      .catch(() => {
        // Activity monitor unavailable — skip muted-speech prompts.
      });

    return () => {
      cancelled = true;
      activityMonitorRef.current?.stop();
      activityMonitorRef.current = null;
    };
  }, [listening, micMuted, showMutedSpeechPrompt, voiceStatus.sttRealtime]);

  useEffect(() => {
    if (!micMuted && mutedSpeechPromptVisibleRef.current) {
      dismissMutedSpeechPrompt();
    }
  }, [dismissMutedSpeechPrompt, micMuted]);

  useEffect(() => {
    return () => {
      activityMonitorRef.current?.stop();
      stopPlayback();
      stopRealtimeListening({ intentional: true });
      if (mediaRecorderRef.current?.state !== "inactive") {
        mediaRecorderRef.current?.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [stopPlayback, stopRealtimeListening]);

  const playClientMessage = useCallback(
    async (messageId: string, text: string) => {
      if (!voiceStatus.ttsEnabled || !text.trim()) {
        return;
      }

      if (playingMessageId === messageId) {
        stopPlayback();
        return;
      }

      stopPlayback();
      setVoiceError(null);
      setLoadingPlayId(messageId);

      try {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, sessionId }),
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "Could not play client voice");
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;

        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => stopPlayback();
        audio.onerror = () => {
          setVoiceError("Audio playback failed");
          stopPlayback();
        };

        setPlayingMessageId(messageId);
        beginClientPlaybackSuppression();
        await audio.play();
      } catch (error) {
        stopPlayback();
        setVoiceError(error instanceof Error ? error.message : "Could not play client voice");
      } finally {
        setLoadingPlayId(null);
      }
    },
    [beginClientPlaybackSuppression, playingMessageId, sessionId, stopPlayback, voiceStatus.ttsEnabled],
  );

  const toggleBatchRecording = useCallback(async (): Promise<string | null> => {
    if (!voiceStatus.sttEnabled || transcribing) {
      return null;
    }

    if (recording) {
      return new Promise((resolve) => {
        transcribeResolverRef.current = resolve;
        mediaRecorderRef.current?.stop();
      });
    }

    setVoiceError(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

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
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        setRecording(false);

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType });
        chunksRef.current = [];

        const text = blob.size > 0 ? await transcribeBlob(blob) : null;
        transcribeResolverRef.current?.(text);
        transcribeResolverRef.current = null;
      };

      recorder.start();
      setRecording(true);
      return null;
    } catch (error) {
      setVoiceError(
        error instanceof Error ? error.message : "Microphone access was denied or unavailable",
      );
      return null;
    }
  }, [recording, transcribing, transcribeBlob, voiceStatus.sttEnabled]);

  const toggleMicMute = useCallback(() => {
    if (!voiceStatus.sttRealtime || !listening) {
      return;
    }

    if (playbackSuppressedRef.current && clientPlayingRef.current) {
      interruptClient();
      return;
    }

    userMutedRef.current = !userMutedRef.current;
    syncMicMuteState();
  }, [interruptClient, listening, syncMicMuteState, voiceStatus.sttRealtime]);

  const toggleBatchMic = useCallback(async (): Promise<string | null> => {
    if (!voiceStatus.sttEnabled || connectingMic || transcribing) {
      return null;
    }

    return toggleBatchRecording();
  }, [connectingMic, toggleBatchRecording, transcribing, voiceStatus.sttEnabled]);

  const clientSpeaking = playingMessageId !== null;
  const playbackMicSuppressed = clientSpeaking && audioOutputMode === "speakers";
  const bargeInEnabled = shouldEnableVoiceBargeIn(audioOutputMode);

  return {
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
    bargeInEnabled,
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
  };
}
