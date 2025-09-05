import { Component, OnInit, OnDestroy } from '@angular/core';
import { SpeechRecognitionService } from '../services/speech-recognition/speech-recognition.service';
import { RecordingService } from '../services/recording/recording.service';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import {
  AudioPipelineInputs,
  AutomaticSpeechRecognitionConfig,
  AutomaticSpeechRecognitionOutput,
  pipeline,
} from '@xenova/transformers';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  imports: [CommonModule],
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'EscuchApp';
  LANGUAGE = 'es';
  private readonly MODEL_PATH = '/xenova-whisper-base';

  // Transcripciones separadas para mejor UX
  partialTranscription = '';
  finalTranscription = '';

  isRecording = false;
  isProcessing = false;

  private destroy$ = new Subject<void>();

  constructor(
    private speechRecognitionService: SpeechRecognitionService,
    private recordingService: RecordingService
  ) {}

  ngOnInit(): void {
    this.recordingService.audioChunk$
      .pipe(takeUntil(this.destroy$))
      .subscribe(async (wavBlob) => {
        const startTime = new Date();

        // Pipeline (esto sirve para usar huggingface de manera OFFLINE)
        const transcriber = await pipeline(
          'automatic-speech-recognition',
          this.MODEL_PATH,
          {
            local_files_only: true,
          }
        );
        const audioPipelineInputs: AudioPipelineInputs =
          URL.createObjectURL(wavBlob);
        const response = (await transcriber(audioPipelineInputs, {
          language: this.LANGUAGE,
          task: 'transcribe',
        } as AutomaticSpeechRecognitionConfig)) as AutomaticSpeechRecognitionOutput;

        console.log('Respuesta de HuggingFace:', response);

        const finishTime = new Date();

        console.log(
          `Transcripción recibida en ${
            finishTime.getTime() - startTime.getTime()
          } ms`
        );

        this.partialTranscription = response.text;
        // Agregar a transcripción final después de un delay
        setTimeout(() => {
          this.finalTranscription += ' ' + response.text;
          this.partialTranscription = '';
        }, 10);
      });

    // this.speechRecognitionService.isProcessing$
    //   .pipe(takeUntil(this.destroy$))
    //   .subscribe((processing) => {
    //     this.isProcessing = processing;
    //   });
  }

  // private async playAudioBlob(blob: Blob): Promise<void> {
  //   return new Promise((resolve, reject) => {
  //     try {
  //       // Crear URL del blob
  //       const audioUrl = URL.createObjectURL(blob);

  //       // Crear elemento de audio
  //       const audio = new Audio(audioUrl);

  //       // Configurar eventos
  //       audio.onended = () => {
  //         URL.revokeObjectURL(audioUrl); // Limpiar memoria
  //         console.log('🎧 Reproducción terminada');
  //         resolve();
  //       };

  //       audio.onerror = (error) => {
  //         URL.revokeObjectURL(audioUrl);
  //         console.error('❌ Error reproduciendo audio:', error);
  //         reject(error);
  //       };

  //       // Reproducir
  //       console.log('🎧 Reproduciendo audio...');
  //       audio.play().catch(reject);
  //     } catch (error) {
  //       console.error('❌ Error creando audio:', error);
  //       reject(error);
  //     }
  //   });
  // }

  startRecording(): void {
    this.isRecording = true;
    this.finalTranscription = '';
    this.partialTranscription = '';
    this.recordingService.startRecording();
  }

  stopRecording(): void {
    this.isRecording = false;
    this.recordingService.stopRecording();
    // this.speechRecognitionService.cancelTranscription();
  }

  clearTranscription(): void {
    this.finalTranscription = '';
    this.partialTranscription = '';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    // this.speechRecognitionService.destroy();
  }
}
