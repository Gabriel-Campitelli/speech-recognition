import { Component, OnInit, OnDestroy } from '@angular/core';
import {
  PartialTranscription,
  SpeechRecognitionService,
} from '../services/speech-recognition/speech-recognition.service';
import { RecordingService } from '../services/recording/recording.service';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  imports: [CommonModule],
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'EscuchApp';

  partialTranscription = '';
  partialTranscriptionTime = 0;
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
        this.speechRecognitionService.processAudioBlob(wavBlob);
      });

    this.speechRecognitionService.partialTranscription$
      .pipe(takeUntil(this.destroy$))
      .subscribe((partialTranscription: PartialTranscription) => {
        this.partialTranscription = partialTranscription.text;
        this.partialTranscriptionTime = partialTranscription.time;
      });

    this.speechRecognitionService.finalTranscription$
      .pipe(takeUntil(this.destroy$))
      .subscribe((text) => {
        this.finalTranscription += `<br>` + text;
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
    // this.speechRecognitionService.cancelTranscription();
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
