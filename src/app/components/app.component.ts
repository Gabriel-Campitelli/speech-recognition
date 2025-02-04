import { Component } from '@angular/core';
import { SpeechRecognitionService } from '../services/speech-recognition/speech-recognition.service';
import { tap } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  title = 'speech-recognition-poc';
  transcription = '';

  constructor(private speechRecognitionService: SpeechRecognitionService) {}

  executeRecognition() {
    this.speechRecognitionService.getResult().then((observable) => {
      observable
        .pipe(
          tap((partialText: string) => {
            this.transcription += ' ' + partialText; // Asegura que la actualización ocurra dentro de Angular
          })
        )
        .subscribe();
    });
  }
}
