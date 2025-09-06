import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { read_audio } from '@xenova/transformers';

export interface PartialTranscription {
  text: string;
  time: number;
}

@Injectable({ providedIn: 'root' })
export class SpeechRecognitionService {
  private worker: Worker | undefined;

  public partialTranscription$ = new Subject<PartialTranscription>();
  public finalTranscription$ = new Subject<string>();

  public isProcessing$ = new BehaviorSubject<boolean>(false);
  private chunkCounter = 0;

  constructor() {
    if (typeof Worker !== 'undefined') {
      this.worker = new Worker(
        new URL('../../speech.worker', import.meta.url),
        {
          type: 'module',
        }
      );

      this.worker.onmessage = (event) => {
        const { id, success, text, error, time } = event.data;

        if (success) {
          this.partialTranscription$.next({ text, time });
          setTimeout(() => {
            this.finalTranscription$.next(text);
          }, 10);
        } else {
          console.error('[Worker] Error:', error);
        }
      };

      this.worker.onerror = (err) => {
        console.error('[Worker] Worker error', err);
      };
    }
  }

  async processAudioBlob(blob: Blob) {
    if (!this.worker || !blob.size) return;
    this.isProcessing$.next(true);

    const audioBlob = await read_audio(URL.createObjectURL(blob), 16000);

    // ===▶ Seguir con el worker
    this.worker.postMessage({
      id: ++this.chunkCounter,
      audioData: audioBlob,
    });
  }

  destroy() {
    console.log('[Service] Cleaning up SpeechRecognitionService');

    // Terminate worker
    if (this.worker) {
      this.worker.terminate();
      this.worker = undefined;
    }

    // Complete subjects
    this.partialTranscription$.complete();
    this.finalTranscription$.complete();
    this.isProcessing$.complete();
  }
}
