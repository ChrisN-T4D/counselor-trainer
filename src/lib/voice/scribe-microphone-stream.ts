import type { RealtimeConnection } from "@elevenlabs/client";
import { loadScribeAudioProcessor } from "@/lib/voice/scribe-audio-processor-worklet";

const TARGET_SAMPLE_RATE = 16000;

const SCRIBE_MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: { ideal: TARGET_SAMPLE_RATE },
  },
};

type ScribeMicrophoneConfig = {
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
};

export type ScribeMicrophoneStream = {
  cleanup: () => void;
  setTrackEnabled: (enabled: boolean) => void;
};

type PreparedScribeMicrophone = {
  attach: (connection: RealtimeConnection, isActive: () => boolean) => ScribeMicrophoneStream;
  cleanup: () => void;
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return btoa(String.fromCharCode(...bytes));
}

/** Request microphone access immediately — triggers the browser permission prompt. */
export async function requestMicrophoneStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia(SCRIBE_MIC_CONSTRAINTS);
}

function isLiveStream(stream: MediaStream): boolean {
  return stream.getAudioTracks().some((track) => track.readyState === "live");
}

async function createMicrophonePipeline(
  stream: MediaStream,
): Promise<{
  audioTrack: MediaStreamTrack;
  source: MediaStreamAudioSourceNode;
  scribeNode: AudioWorkletNode;
  audioContext: AudioContext;
}> {
  const [audioTrack] = stream.getAudioTracks();
  const streamSampleRate = audioTrack?.getSettings().sampleRate;
  const audioContext = new AudioContext(streamSampleRate ? { sampleRate: streamSampleRate } : {});

  await loadScribeAudioProcessor(audioContext.audioWorklet);

  const source = audioContext.createMediaStreamSource(stream);
  const scribeNode = new AudioWorkletNode(audioContext, "scribeAudioProcessor");

  if (audioContext.sampleRate !== TARGET_SAMPLE_RATE) {
    scribeNode.port.postMessage({
      type: "configure",
      inputSampleRate: audioContext.sampleRate,
      outputSampleRate: TARGET_SAMPLE_RATE,
    });
  }

  source.connect(scribeNode);

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  return { audioTrack, source, scribeNode, audioContext };
}

/** Load the audio worklet while the Scribe WebSocket handshake runs. */
export async function prepareScribeMicrophoneStream(
  stream: MediaStream,
): Promise<PreparedScribeMicrophone> {
  const pipeline = await createMicrophonePipeline(stream);

  const cleanup = () => {
    for (const track of stream.getTracks()) {
      track.stop();
    }
    pipeline.source.disconnect();
    pipeline.scribeNode.disconnect();
    void pipeline.audioContext.close();
  };

  return {
    cleanup,
    attach: (connection, isActive) => {
      pipeline.scribeNode.port.onmessage = (event: MessageEvent<{ audioData: ArrayBuffer }>) => {
        if (!isActive()) {
          return;
        }

        try {
          connection.send({ audioBase64: arrayBufferToBase64(event.data.audioData) });
        } catch {
          // Connection closed — ignore further audio frames.
        }
      };

      return {
        cleanup,
        setTrackEnabled: (enabled: boolean) => {
          pipeline.audioTrack.enabled = enabled;
        },
      };
    },
  };
}

export async function startScribeMicrophoneStream(
  connection: RealtimeConnection,
  config: ScribeMicrophoneConfig,
  isActive: () => boolean,
  existingStream?: MediaStream,
): Promise<ScribeMicrophoneStream> {
  const stream =
    existingStream && isLiveStream(existingStream)
      ? existingStream
      : await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: config.echoCancellation ?? true,
            noiseSuppression: config.noiseSuppression ?? true,
            autoGainControl: config.autoGainControl ?? true,
            channelCount: 1,
            sampleRate: { ideal: TARGET_SAMPLE_RATE },
          },
        });

  const prepared = await prepareScribeMicrophoneStream(stream);
  return prepared.attach(connection, isActive);
}
