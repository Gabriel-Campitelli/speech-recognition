/// <reference lib="webworker" />

import {
  AutomaticSpeechRecognitionPipeline,
  pipeline,
  AutomaticSpeechRecognitionConfig,
  AudioPipelineInputs,
  AutomaticSpeechRecognitionOutput,
} from '@xenova/transformers';

interface WorkerMessage {
  id: number;
  audioData: Float32Array<ArrayBuffer>;
  sampleRate: number;
}

let transcriber: AutomaticSpeechRecognitionPipeline;

const DEFAULT_CONFIG: AutomaticSpeechRecognitionConfig = {
  language: 'es',
  task: 'transcribe',
};

const MODEL_PATH = '/xenova-whisper-base';

const init = async () => {
  if (!transcriber) {
    console.log('[Worker] Inicializando pipeline...');
    transcriber = await pipeline('automatic-speech-recognition', MODEL_PATH);
    console.log('[Worker] Listo ✅');
  }
};

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  console.log('[Worker] Mensaje recibido:', e.data);
  const { id, audioData } = e.data;

  try {
    await init();
    const startTime = new Date();

    const audioPipelineInputs: AudioPipelineInputs = audioData;

    const result:
      | AutomaticSpeechRecognitionOutput
      | AutomaticSpeechRecognitionOutput[] = await transcriber(
      audioPipelineInputs,
      {
        ...DEFAULT_CONFIG,
      }
    );

    const finishTime = new Date();

    const text = Array.isArray(result)
      ? result.map((r: any) => r.text || '').join(' ')
      : result.text;

    self.postMessage({
      id,
      success: true,
      text,
      time: finishTime.getTime() - startTime.getTime(),
    });
  } catch (err: any) {
    self.postMessage({ id, success: false, error: err.message });
  }
};

console.log('[Worker] Speech recognition worker iniciado');
