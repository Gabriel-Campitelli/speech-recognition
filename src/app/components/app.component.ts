import { Component } from '@angular/core';
import { SpeechRecognitionService } from '../services/speech-recognition/speech-recognition.service';
import { tap } from 'rxjs/operators';
import { RecordingService } from '../services/recording/recording.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  title = 'speech-recognition-poc';
  transcription = '';
  oldPartialText = '';
  isRecording: boolean = false;

  constructor(
    private speechRecognitionService: SpeechRecognitionService,
    private readonly recordingService: RecordingService
  ) {}

  executeRecognition() {
    // this.speechRecognitionService.getResult().then((observable) => {
    //   observable
    //     .pipe(
    //       tap((partialText: string) => {
    //         this.transcription += ' ' + this.oldPartialText;
    //         this.oldPartialText = partialText;
    //       })
    //     )
    //     .subscribe();
    // });
  }

  startRecording(): void {
    this.isRecording = true;
    this.recordingService.initiateRecording();
  }

  stopRecording() {
    this.isRecording = false;

    this.recordingService
      .stopRecording()
      .subscribe((recordedAudioObservable) => {
        this.speechRecognitionService
          .getResult(recordedAudioObservable)
          .then((observable2) => {
            observable2
              .pipe(
                tap((partialText: string) => {
                  this.transcription += ' ' + this.oldPartialText;
                  this.oldPartialText = partialText;
                })
              )
              .subscribe();
          });
      });
  }
}
