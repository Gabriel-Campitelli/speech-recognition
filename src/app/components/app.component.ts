import { Component, OnInit, OnDestroy } from '@angular/core';
import { SpeechRecognitionService } from '../services/speech-recognition/speech-recognition.service';
import { RecordingService } from '../services/recording/recording.service';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  imports: [CommonModule]
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'EscuchApp';
  
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
    // Suscribirse a chunks de audio
    this.recordingService.audioChunk$
      .pipe(takeUntil(this.destroy$))
      .subscribe((audioChunk) => {
        this.speechRecognitionService.processAudioChunk(audioChunk);
      });

    // Suscribirse a transcripciones parciales (tiempo real)
    this.speechRecognitionService.partialTranscription$
      .pipe(takeUntil(this.destroy$))
      .subscribe((text) => {
        this.partialTranscription = text;
        // Agregar a transcripción final después de un delay
        setTimeout(() => {
          this.finalTranscription += ' ' + text;
          this.partialTranscription = '';
        }, 1000);
      });

    // Suscribirse al estado de procesamiento
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