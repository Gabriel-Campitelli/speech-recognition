import { Injectable } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SpeechRecognitionService {
  private worker: Worker | null = null;
  private chunkCounter = 0;
  private processingChunks = new Map<
    number,
    { timestamp: number; audioData: Float32Array }
  >();

  // Subjects para diferentes tipos de transcripción
  public partialTranscription$ = new Subject<string>(); // Transcripción parcial en tiempo real
  public finalTranscription$ = new Subject<string>(); // Transcripción final consolidada
  public isProcessing$ = new BehaviorSubject<boolean>(false);

  private readonly AUTOMATIC_SR_CONFIG = {
    language: 'es',
    task: 'transcribe',
    stride_length_s: 0.5, // Reducido para mayor fluidez
    chunk_length_s: 3, // Chunks más pequeños para mayor velocidad
  };

  constructor() {
    this.initializeWorker();
  }

  private initializeWorker() {
    if (typeof Worker !== 'undefined') {
      this.worker = new Worker(
        new URL('../../speech.worker.ts', import.meta.url),
        {
          type: 'module',
        }
      );

      this.worker.onmessage = (e) => {
        const { id, success, text, error, timestamp } = e.data;

        if (success && text && text.trim()) {
          // Emitir transcripción parcial inmediatamente
          this.partialTranscription$.next(text.trim());

          // Limpiar chunk procesado
          this.processingChunks.delete(id);

          // Actualizar estado de procesamiento
          this.isProcessing$.next(this.processingChunks.size > 0);
        } else if (error) {
          console.error('Worker error:', error);
          this.processingChunks.delete(id);
          this.isProcessing$.next(this.processingChunks.size > 0);
        }
      };

      this.worker.onerror = (error) => {
        console.error('Worker error:', error);
        this.isProcessing$.next(false);
      };
    }
  }

  processAudioChunk(audioBuffer: Float32Array) {
    if (!this.worker || !audioBuffer || audioBuffer.length === 0) {
      return;
    }

    // Asignar ID único al chunk
    const chunkId = ++this.chunkCounter;

    // Guardar referencia del chunk que se está procesando
    this.processingChunks.set(chunkId, {
      timestamp: Date.now(),
      audioData: audioBuffer,
    });

    // Actualizar estado de procesamiento
    this.isProcessing$.next(true);

    // Enviar chunk al worker para procesamiento asíncrono
    this.worker.postMessage({
      id: chunkId,
      audioData: audioBuffer,
      config: this.AUTOMATIC_SR_CONFIG,
    });

    // Limpiar chunks antiguos (más de 10 segundos)
    this.cleanupOldChunks();
  }

  private cleanupOldChunks() {
    const now = Date.now();
    const maxAge = 10000; // 10 segundos

    for (const [id, chunk] of this.processingChunks.entries()) {
      if (now - chunk.timestamp > maxAge) {
        this.processingChunks.delete(id);
      }
    }

    this.isProcessing$.next(this.processingChunks.size > 0);
  }

  cancelTranscription() {
    this.processingChunks.clear();
    this.isProcessing$.next(false);
  }

  destroy() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.processingChunks.clear();
  }
}
