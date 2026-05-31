"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AudioOutputMode,
  type AudioOutputModeHint,
  detectLikelyAudioOutputMode,
  loadAudioOutputMode,
  resolveDefaultAudioOutputMode,
  saveAudioOutputMode,
} from "@/lib/voice/audio-output-mode";
import { monitorVoiceActivity } from "@/lib/voice/voice-activity";

type VoiceStatus = {
  ttsEnabled: boolean;
  sttEnabled: boolean;
  ttsError?: string;
  sttError?: string;
};

const POST_TTS_DELAY_MS = 350;
const MAX_UTTERANCE_MS = 120_000;

export function usePracticeVoice(sessionId: string) {
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
  const [handsFreePaused, setHandsFreePaused] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
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
  const handsFreePausedRef = useRef(false);
  const onAutoSendRef = useRef<((text: string) => void | Promise<void>) | null>(null);
  const voiceStatusRef = useRef(voiceStatus);

  const handsFreeActive =
    voiceStatus.sttEnabled && audioOutputMode === "speakers";
  const clientSpeaking = playingMessageId !== null;
  const micPaused = handsFreeActive && (clientSpeaking || handsFreePaused);

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
  }, []);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setPlayingMessageId(null);
  }, []);

  useEffect(() => {
    playingMessageIdRef.current = playingMessageId;
  }, [playingMessageId]);

  useEffect(() => {
    handsFreePausedRef.current = handsFreePaused;
  }, [handsFreePaused]);

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

  const pauseHandsFreeListening = useCallback(() => {
    stopVad();
    clearPostTtsTimer();
    if (mediaRecorderRef.current?.state === "recording") {
      void finishRecorder();
    }
    setListening(false);
  }, [clearPostTtsTimer, finishRecorder, stopVad]);

  const resumeHandsFreeListening = useCallback(async () => {
    if (
      !sessionActiveRef.current ||
      !voiceStatusRef.current.sttEnabled ||
      audioOutputModeRef.current !== "speakers" ||
      handsFreePausedRef.current ||
      playingMessageIdRef.current !== null
    ) {
      return;
    }

    const stream = await ensureMicStream();
    if (!stream) {
      return;
    }

    stopVad();
    setListening(true);
    setVoiceError(null);

    vadStopRef.current = monitorVoiceActivity(stream, {
      onSpeechStart: () => {
        void startSpeechRecorder();
      },
      onSpeechEnd: () => {
        void (async () => {
          const text = await finishRecorder();
          stopVad();
          setListening(false);

          if (text) {
            await onAutoSendRef.current?.(text);
          } else if (
            sessionActiveRef.current &&
            !handsFreePausedRef.current &&
            audioOutputModeRef.current === "speakers"
          ) {
            void resumeHandsFreeListening();
          }
        })();
      },
    });
  }, [ensureMicStream, finishRecorder, startSpeechRecorder, stopVad]);

  const scheduleHandsFreeListening = useCallback(() => {
    if (audioOutputModeRef.current !== "speakers" || !voiceStatusRef.current.sttEnabled) {
      return;
    }

    handsFreePausedRef.current = false;
    setHandsFreePaused(false);
    clearPostTtsTimer();
    postTtsTimerRef.current = window.setTimeout(() => {
      void resumeHandsFreeListening();
    }, POST_TTS_DELAY_MS);
  }, [clearPostTtsTimer, resumeHandsFreeListening]);

  const interruptClient = useCallback(() => {
    stopPlayback();
    scheduleHandsFreeListening();
  }, [scheduleHandsFreeListening, stopPlayback]);

  const setOnAutoSend = useCallback((handler: ((text: string) => void | Promise<void>) | null) => {
    onAutoSendRef.current = handler;
  }, []);

  const setSessionActive = useCallback(
    (active: boolean) => {
      sessionActiveRef.current = active;
      if (!active) {
        stopPlayback();
        handsFreePausedRef.current = true;
        setHandsFreePaused(true);
        releaseMic();
      }
    },
    [releaseMic, stopPlayback],
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
    if (audioOutputMode !== "speakers") {
      handsFreePausedRef.current = true;
      setHandsFreePaused(true);
      pauseHandsFreeListening();
      if (mediaStreamRef.current && !recording) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      return;
    }

    if (sessionActiveRef.current && voiceStatusRef.current.sttEnabled && !handsFreePausedRef.current) {
      scheduleHandsFreeListening();
    }
  }, [audioOutputMode, pauseHandsFreeListening, recording, scheduleHandsFreeListening]);

  useEffect(() => {
    return () => {
      stopPlayback();
      releaseMic();
    };
  }, [releaseMic, stopPlayback]);

  const playClientMessage = useCallback(
    async (messageId: string, text: string) => {
      if (!voiceStatus.ttsEnabled || !text.trim()) {
        return;
      }

      if (playingMessageId === messageId) {
        interruptClient();
        return;
      }

      pauseHandsFreeListening();
      stopPlayback();
      setVoiceError(null);
      setLoadingPlayId(messageId);

      try {
        const response = await fetch("/api/tts", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, sessionId }),
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          if (response.status === 401 && data.error === "Unauthorized") {
            throw new Error("Your session expired. Refresh the page and sign in again.");
          }
          throw new Error(data.error ?? "Could not play client voice");
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;

        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          stopPlayback();
          scheduleHandsFreeListening();
        };
        audio.onerror = () => {
          setVoiceError("Audio playback failed");
          stopPlayback();
          scheduleHandsFreeListening();
        };

        setPlayingMessageId(messageId);
        await audio.play();
      } catch (error) {
        stopPlayback();
        setVoiceError(error instanceof Error ? error.message : "Could not play client voice");
        scheduleHandsFreeListening();
      } finally {
        setLoadingPlayId(null);
      }
    },
    [
      interruptClient,
      pauseHandsFreeListening,
      playingMessageId,
      scheduleHandsFreeListening,
      sessionId,
      stopPlayback,
      voiceStatus.ttsEnabled,
    ],
  );

  const toggleBatchRecording = useCallback(async (): Promise<string | null> => {
    if (!voiceStatus.sttEnabled || transcribing || handsFreeActive) {
      return null;
    }

    if (recording) {
      return finishRecorder();
    }

    setVoiceError(null);
    chunksRef.current = [];

    try {
      const stream = await ensureMicStream();
      if (!stream) {
        return null;
      }

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
  }, [ensureMicStream, finishRecorder, handsFreeActive, recording, transcribing, transcribeBlob, voiceStatus.sttEnabled]);

  const toggleBatchMic = useCallback(async (): Promise<string | null> => {
    if (!voiceStatus.sttEnabled || transcribing || handsFreeActive) {
      return null;
    }

    return toggleBatchRecording();
  }, [handsFreeActive, toggleBatchRecording, transcribing, voiceStatus.sttEnabled]);

  const beginHandsFreeTurn = useCallback(() => {
    if (!handsFreeActive || !sessionActiveRef.current) {
      return;
    }
    scheduleHandsFreeListening();
  }, [handsFreeActive, scheduleHandsFreeListening]);

  const pauseHandsFreeForSend = useCallback(() => {
    handsFreePausedRef.current = true;
    setHandsFreePaused(true);
    pauseHandsFreeListening();
  }, [pauseHandsFreeListening]);

  const resumeHandsFreeAfterSend = useCallback(() => {
    handsFreePausedRef.current = false;
    setHandsFreePaused(false);
    if (voiceStatusRef.current.ttsEnabled) {
      return;
    }
    scheduleHandsFreeListening();
  }, [scheduleHandsFreeListening]);

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
    handsFreeActive,
    clientSpeaking,
    micPaused,
    playClientMessage,
    setSessionActive,
    toggleBatchMic,
    interruptClient,
    setOnAutoSend,
    beginHandsFreeTurn,
    pauseHandsFreeForSend,
    resumeHandsFreeAfterSend,
  };
}
