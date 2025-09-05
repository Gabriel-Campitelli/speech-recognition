import { Component, OnInit, OnDestroy } from '@angular/core';
import { SpeechRecognitionService } from '../services/speech-recognition/speech-recognition.service';
import { RecordingService } from '../services/recording/recording.service';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import {
  AutomaticSpeechRecognitionArgs,
  InferenceClient,
} from '@huggingface/inference';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  imports: [CommonModule],
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'EscuchApp';
  LANGUAGE = 'es';
  private HUGGINGFACE_ACCESS_TOKEN = environment.huggingFaceAccessToken;

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
    const client = new InferenceClient(this.HUGGINGFACE_ACCESS_TOKEN);

    this.recordingService.audioChunk$
      .pipe(takeUntil(this.destroy$))
      .subscribe(async (wavBlob) => {
        const startTime = new Date();

        const args: AutomaticSpeechRecognitionArgs = {
          model: 'openai/whisper-large-v3',
          provider: 'hf-inference',
          language: this.LANGUAGE,
          inputs: wavBlob,
        };

        const response = await client.automaticSpeechRecognition(args);
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

    this.speechRecognitionService.isProcessing$
      .pipe(takeUntil(this.destroy$))
      .subscribe((processing) => {
        this.isProcessing = processing;
      });
  }

  startRecording(): void {
    this.isRecording = true;
    this.finalTranscription = '';
    this.partialTranscription = '';
    this.recordingService.startRecording();
  }

  stopRecording(): void {
    this.isRecording = false;
    this.recordingService.stopRecording();
    this.speechRecognitionService.cancelTranscription();
  }

  clearTranscription(): void {
    this.finalTranscription = '';
    this.partialTranscription = '';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.speechRecognitionService.destroy();
  }
}
