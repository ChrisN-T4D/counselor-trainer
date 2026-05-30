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

type VoiceStatus = {
  ttsEnabled: boolean;
  sttEnabled: boolean;
};

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
  const [transcribing, setTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const transcribeResolverRef = useRef<((text: string | null) => void) | null>(null);
  const audioOutputModeRef = useRef<AudioOutputMode>("speakers");

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

  const setAudioOutputMode = useCallback((mode: AudioOutputMode) => {
    audioOutputModeRef.current = mode;
    setAudioOutputModeState(mode);
    setAudioOutputModeHint("saved");
    saveAudioOutputMode(mode);
  }, []);

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

  const setSessionActive = useCallback(
    (active: boolean) => {
      if (!active) {
        stopPlayback();
        if (mediaRecorderRef.current?.state !== "inactive") {
          mediaRecorderRef.current?.stop();
        }
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      }
    },
    [stopPlayback],
  );

  useEffect(() => {
    async function loadVoiceStatus() {
      const response = await fetch("/api/voice/status");
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as VoiceStatus;
      setVoiceStatus(data);
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
    return () => {
      stopPlayback();
      if (mediaRecorderRef.current?.state !== "inactive") {
        mediaRecorderRef.current?.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [stopPlayback]);

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
        await audio.play();
      } catch (error) {
        stopPlayback();
        setVoiceError(error instanceof Error ? error.message : "Could not play client voice");
      } finally {
        setLoadingPlayId(null);
      }
    },
    [playingMessageId, sessionId, stopPlayback, voiceStatus.ttsEnabled],
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

  const toggleBatchMic = useCallback(async (): Promise<string | null> => {
    if (!voiceStatus.sttEnabled || transcribing) {
      return null;
    }

    return toggleBatchRecording();
  }, [toggleBatchRecording, transcribing, voiceStatus.sttEnabled]);

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
    transcribing,
    playClientMessage,
    setSessionActive,
    toggleBatchMic,
  };
}
