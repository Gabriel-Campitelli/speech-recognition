import { Component, OnInit } from '@angular/core';
import { SpeechRecognitionService } from '../services/speech-recognition/speech-recognition.service';
import { tap } from 'rxjs/operators';
import { RecordingService } from '../services/recording/recording.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  title = 'speech-recognition-poc';
  transcription = '';
  oldPartialText = '';
  isRecording: boolean = false;

  constructor(
    private speechRecognitionService: SpeechRecognitionService,
    private readonly recordingService: RecordingService
  ) {}

  ngOnInit(): void {
    this.recordingService.recordedChunk$
      .pipe(tap((recordedAudio) => console.log({ recordedAudio })))
      .subscribe((recordedAudio) => {
        this.speechRecognitionService.getResult(recordedAudio);
      });

    this.speechRecognitionService?.transcriptionSubject$
      .pipe(
        tap((partialText: string) => {
          this.transcription += ' ' + this.oldPartialText;
          this.oldPartialText = partialText;
        })
      )
      .subscribe();
  }

  startRecording(): void {
    this.isRecording = true;
    this.recordingService.startRecording();
  }

  stopRecording() {
    this.isRecording = false;

    this.recordingService.stopRecording();
  }
}
