/// <reference lib="webworker" />

import {
  AutomaticSpeechRecognitionPipeline,
  pipeline,
} from '@xenova/transformers';

// Tipos para mejor type safety
interface WorkerMessage {
  id: string;
  audioData: Float32Array | ArrayBuffer;
  config?: {
    language?: string;
    task?: 'transcribe' | 'translate';
    chunk_length_s?: number;
    stride_length_s?: number;
    return_timestamps?: boolean;
  };
}

interface WorkerResponse {
  id: string;
  success: boolean;
  text?: string;
  error?: string;
  timestamp: number;
  processingTime?: number;
}

// Estado del worker
let recognitionPipeline: AutomaticSpeechRecognitionPipeline | null = null;
let isInitializing = false;
let initializationPromise: Promise<void> | null = null;

// Configuración por defecto
const DEFAULT_CONFIG = {
  language: 'spanish', // o 'auto' para detección automática
  task: 'transcribe' as const,
  chunk_length_s: 30,
  stride_length_s: 5,
  return_timestamps: false,
};

const initializePipeline = async (): Promise<void> => {
  // Evitar múltiples inicializaciones simultáneas
  if (recognitionPipeline) return;
  if (isInitializing && initializationPromise) return initializationPromise;

  isInitializing = true;

  initializationPromise = (async () => {
    try {
      console.log('[Worker] Inicializando pipeline...');

      recognitionPipeline = await pipeline(
        'automatic-speech-recognition',
        'onnx-community/whisper-tiny',
        {
          device: 'wasm', // Forzar WebAssembly para browser
          local_files_only: false,
        } as any // Casting para evitar el error de tipos que mencionaste antes
      );

      console.log('[Worker] Pipeline inicializado correctamente');
    } catch (error) {
      console.error('[Worker] Error inicializando pipeline:', error);
      recognitionPipeline = null;
      throw error;
    } finally {
      isInitializing = false;
    }
  })();

  return initializationPromise;
};

const processAudio = async (
  audioData: Float32Array | ArrayBuffer,
  config: WorkerMessage['config'] = {}
): Promise<string> => {
  if (!recognitionPipeline) {
    throw new Error('Pipeline no inicializado');
  }

  // Convertir ArrayBuffer a Float32Array si es necesario
  let processedAudio: Float32Array;
  if (audioData instanceof ArrayBuffer) {
    processedAudio = new Float32Array(audioData);
  } else {
    processedAudio = audioData;
  }

  // Validar que tenemos datos de audio
  if (processedAudio.length === 0) {
    throw new Error('No hay datos de audio para procesar');
  }

  // Combinar config por defecto con el recibido
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  console.log(`[Worker] Procesando ${processedAudio.length} samples de audio`);

  const result = await recognitionPipeline(processedAudio, finalConfig);

  // Extraer texto del resultado
  let text: string;
  if (Array.isArray(result)) {
    text = result
      .map((r: any) => r.text || '')
      .join(' ')
      .trim();
  } else if (result && typeof result === 'object' && 'text' in result) {
    text = (result as any).text || '';
  } else {
    text = String(result || '');
  }

  return text;
};

const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
};

// Handler principal de mensajes
self.onmessage = async function (e: MessageEvent) {
  const { id, audioData, config } = e.data;
  const startTime = performance.now();

  const sendResponse = (
    response: Omit<WorkerResponse, 'timestamp' | 'processingTime'>
  ) => {
    const processingTime = performance.now() - startTime;
    self.postMessage({
      ...response,
      timestamp: Date.now(),
      processingTime: Math.round(processingTime),
    });
  };

  try {
    // Validar datos de entrada
    if (!id) {
      throw new Error('ID de mensaje requerido');
    }

    if (!audioData) {
      throw new Error('Datos de audio requeridos');
    }

    // Inicializar pipeline si es necesario
    await initializePipeline();

    // Procesar audio
    const text = await processAudio(audioData, config);

    // Enviar resultado exitoso
    sendResponse({
      id,
      success: true,
      text: text.trim(),
    });
  } catch (error) {
    console.error('[Worker] Error procesando audio:', error);

    sendResponse({
      id,
      success: false,
      error: formatError(error),
    });
  }
};

// Manejo de errores no capturados
self.onerror = (error) => {
  console.error('[Worker] Error no capturado:', error);
};

self.onunhandledrejection = (event) => {
  console.error('[Worker] Promise rechazada no manejada:', event.reason);
};

// Mensaje de inicialización
console.log('[Worker] Speech recognition worker iniciado');
