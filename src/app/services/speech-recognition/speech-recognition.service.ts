import { Injectable } from '@angular/core';
import {
  pipeline,
  AutomaticSpeechRecognitionOutput,
  AutomaticSpeechRecognitionConfig,
  PretrainedOptions,
  env,
} from '@huggingface/transformers';
import { Subject, Observable, of, throwError } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SpeechRecognitionService {
  private readonly WHISPER_TINY_MODEL_URL =
    '../../..assets/transform-models/whisper-tiny';
  private SPEECH_RECOGNITION_CONFIG: PretrainedOptions = {
    cache_dir: this.WHISPER_TINY_MODEL_URL,
    local_files_only: true,
  };

  constructor() {
    env.localModelPath = '/assets/transform-models/';
    env.allowLocalModels = true;
  }

  async getResult(audioBuffer?: Float32Array): Promise<Observable<string>> {
    if (!audioBuffer) {
      const url = '../../../assets/salvador-sample.wav';
      // audioBuffer = await this.loadWavFile(url);
      return throwError('Error');
    }

    return this.transcribeWithoutChunks(audioBuffer);
    // return this.transcribeInChunks(audioBuffer);
  }

  reproduceAudio(audioBlob: Blob) {
    // Crear una URL para reproducir el audio
    const audioUrl = URL.createObjectURL(audioBlob);

    // Opcional: reproducir automáticamente
    const audio = new Audio(audioUrl);
    audio.play();
  }

  async transcribeWithoutChunks(audio: Float32Array) {
    const subject = new Subject<string>(); // Emisor de resultados parciales

    console.warn('Started processing');
    pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-tiny',
      this.SPEECH_RECOGNITION_CONFIG
    )
      .then(async (automaticSpeechRecognition) => {
        try {
          const config = {
            language: 'es', // Forzar reconocimiento en español
            task: 'transcribe',
            return_timestamps: 'word',
            stride_length_s: 1, // Evita cortes bruscos en el audio
            // chunk_length_s: 5, // Procesa en fragmentos de 5 segundos
          } as AutomaticSpeechRecognitionConfig;
          console.warn('Processing in progress');

          const result = (await automaticSpeechRecognition(
            audio,
            config
          )) as AutomaticSpeechRecognitionOutput;

          await new Promise((resolve) => setTimeout(resolve, 1));

          console.warn('Processing finished');
          subject.next(result.text); // Emitir resultado parcial
        } catch (error) {
          console.error(`Error procesando el audio`, error);
        }

        subject.complete(); // Indica que la transcripción ha terminado
      })

      .catch((error) => {
        console.error('Error cargando el modelo de Whisper:', error);
      });

    return subject.asObservable();
  }

  // async transcribeInChunks(audioBuffer: AudioBuffer, chunkSizeSec = 10) {
  //   const subject = new Subject<string>(); // Emisor de resultados parciales

  //   pipeline(
  //     'automatic-speech-recognition',
  //     'Xenova/whisper-tiny',
  //     this.SPEECH_RECOGNITION_CONFIG
  //   )
  //     .then(async (automaticSpeechRecognition) => {
  //       const sampleRate = audioBuffer.sampleRate; // Normalmente 16000 para Whisper
  //       const chunkSamples = Math.floor(chunkSizeSec * sampleRate);
  //       const totalChunks = Math.ceil(audioBuffer.duration / chunkSizeSec);

  //       const audioData = this.getAudioData(audioBuffer);
  //       const numChannels = audioData.length; // Detecta si es mono o estéreo

  //       for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
  //         const startSample = chunkIndex * chunkSamples;
  //         const endSample = Math.min(
  //           startSample + chunkSamples,
  //           audioData[0].length
  //         );

  //         const chunk = new Float32Array(endSample - startSample);

  //         // 📌 Convertir a mono promediando canales
  //         for (let ch = 0; ch < numChannels; ch++) {
  //           const channelChunk = audioData[ch].subarray(startSample, endSample);
  //           for (let i = 0; i < channelChunk.length; i++) {
  //             chunk[i] += channelChunk[i]; // Suma cada canal
  //           }
  //         }
  //         for (let i = 0; i < chunk.length; i++) {
  //           chunk[i] /= numChannels; // Saca el promedio
  //         }

  //         const startTime = new Date().getTime();
  //         console.log(
  //           `Procesando chunk ${chunkIndex + 1} de ${totalChunks}...`
  //         );

  //         try {
  //           const config = {
  //             language: 'es', // Forzar reconocimiento en español
  //             task: 'transcribe',
  //             return_timestamps: 'word',
  //             stride_length_s: 1, // Evita cortes bruscos en el audio
  //             // chunk_length_s: 5, // Procesa en fragmentos de 5 segundos
  //           } as AutomaticSpeechRecognitionConfig;

  //           const result = (await automaticSpeechRecognition(
  //             chunk,
  //             config
  //           )) as AutomaticSpeechRecognitionOutput;

  //           await new Promise((resolve) => setTimeout(resolve, 1));
  //           subject.next(result.text); // Emitir resultado parcial

  //           // from(automaticSpeechRecognition(chunk, config))
  //           //   .pipe(
  //           //     tap((result: any) => {
  //           //       subject.next(result.text);
  //           //     })
  //           //   )
  //           //   .subscribe();

  //           const endTime = new Date().getTime();
  //           // 📌 Calcular la diferencia (en milisegundos)
  //           const elapsedTime = endTime - startTime;

  //           console.log(
  //             `La función tardó ${elapsedTime / 1000} segundos en ejecutarse.`
  //           );
  //         } catch (error) {
  //           console.error(`Error en chunk ${chunkIndex + 1}:`, error);
  //         }
  //       }
  //       subject.complete(); // Indica que la transcripción ha terminado
  //     })
  //     .catch((error) => {
  //       console.error('Error cargando el modelo de Whisper:', error);
  //     });

  //   return subject.asObservable();
  // }

  // getAudioData(audioBuffer: AudioBuffer): Float32Array[] {
  //   return Array.from(
  //     { length: audioBuffer.numberOfChannels },
  //     (_, i) => audioBuffer.getChannelData(i) // Extrae cada canal
  //   );
  // }

  // private async loadWavFile(url: string): Promise<Float32Array> {
  //   // 1️⃣ Descargar el archivo WAV desde la URL
  //   const response = await fetch(url);
  //   const arrayBuffer = await response.arrayBuffer();

  //   this.reproduceAudio(new Blob([arrayBuffer]));

  //   // 2️⃣ Crear un AudioContext y decodificar el audio
  //   const audioContext = new AudioContext({ sampleRate: 16000 }); // Whisper usa 16kHz
  //   const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  //   return audioBuffer.getChannelData(0);
  // }
}
