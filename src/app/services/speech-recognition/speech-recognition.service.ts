import { Injectable } from '@angular/core';
import {
  pipeline,
  AutomaticSpeechRecognitionOutput,
  // env,
} from '@huggingface/transformers';
import { Subject, from, takeUntil, concatMap, Subscription } from 'rxjs';

/** SRS stands for Speech Recognition Service */
/** SR stands for Speech Recognition */

@Injectable({
  providedIn: 'root',
})
export class SpeechRecognitionService {
  private readonly SRS_CACHE = '../../../assets/transform-models';
  private readonly SPEECH_RECOGNITION_SERVICE_CONFIG = {
    // cache_dir: this.SRS_CACHE,
    // local_files_only: true,
  };
  private readonly AUTOMATIC_SR_CONFIG = {
    language: 'es', // Forzar reconocimiento en español
    task: 'transcribe',
    stride_length_s: 1, // Evita cortes bruscos en el audio
    chunk_length_s: 5, // Procesa en fragmentos de 5 segundos
  };

  private shouldRecognize$: Subject<void> = new Subject();
  private recognitionPipeline: any; // Store the pipeline instance
  private audioChunks: Float32Array[] = []; // Array para almacenar los chunks
  recognitionSubscription: Subscription | undefined;

  constructor() {
    // env.localModelPath = '/assets/transform-models/';
    // env.allowLocalModels = true;
  }

  private async initializePipeline() {
    if (!this.recognitionPipeline) {
      // Initialize only once
      this.recognitionPipeline = await pipeline(
        'automatic-speech-recognition',
        'onnx-community/whisper-tiny'
        // this.SPEECH_RECOGNITION_SERVICE_CONFIG
      );
    }
  }

  getResult(audioBuffer: Float32Array) {
    if (!audioBuffer) {
      // const url = '../../../assets/salvador-sample.wav';
      // audioBuffer = await this.loadWavFile(url);
      // return throwError('Error');
    }

    this.processChunk(audioBuffer);
  }

  processChunk(audioChunk: Float32Array) {
    this.audioChunks.push(audioChunk); // Añadir el nuevo chunk al array

    if (!this.recognitionSubscription) {
      // Si no hay una suscripción activa, crearla
      this.startChunkedTranscription();
    }
  }

  transcriptionSubject$ = new Subject<string>(); // Emisor de resultados parciales
  async startChunkedTranscription() {
    this.shouldRecognize$ = new Subject();

    await this.initializePipeline(); // Ensure pipeline is initialized

    console.warn('Started processing');

    from(this.audioChunks)
      .pipe(
        takeUntil(this.shouldRecognize$),
        concatMap(async (audioChunk) => {
          try {
            // this.reproduceAudio(audioChunk); // Reproduce the current chunk

            console.warn('Processing chunk in progress');

            const result = (await this.recognitionPipeline(
              // Use the stored pipeline
              audioChunk,
              this.AUTOMATIC_SR_CONFIG
            )) as AutomaticSpeechRecognitionOutput;

            console.warn('Chunk processing finished');
            return result.text; // Return the transcription for this chunk
          } catch (error) {
            console.error('Error procesando el chunk', error);
            this.transcriptionSubject$.error(error);
            return null;
          }
        })
      )
      .subscribe({
        next: (text) => {
          console.log(text);
          if (text !== null) {
            // Check if the chunk processing was successful
            this.transcriptionSubject$.next(text); // Emit the transcription for the chunk
          }
        },
        error: (error) => {
          console.error('Transcription error:', error);
          this.transcriptionSubject$.error(error);
          this.resetTranscription(); // Reiniciar el estado para el próximo audio
        },
        complete: () => {
          console.warn('All chunks processed.');
          // this.transcriptionSubject$.complete();
          this.resetTranscription(); // Reiniciar el estado para el próximo audio
        },
      });

    // return subject.asObservable();
  }

  cancelTranscription() {
    if (this.shouldRecognize$) {
      this.shouldRecognize$.next();
      this.shouldRecognize$.complete();
      console.warn('Transcription cancelled.');
    } else {
      console.warn('No transcription to cancel.');
    }
  }

  resetTranscription() {
    this.audioChunks = []; // Limpiar el array de chunks
    this.recognitionSubscription?.unsubscribe(); // Desuscribirse
    this.recognitionSubscription = undefined;
  }

  private reproduceAudio(float32Array: Float32Array) {
    const audioContext = new AudioContext();
    const buffer = audioContext.createBuffer(1, float32Array.length, 16000);
    buffer.copyToChannel(float32Array, 0);

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);

    source.start();
  }
}
