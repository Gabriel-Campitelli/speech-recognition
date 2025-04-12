import { Injectable } from '@angular/core';
import { concatMap, Subject, takeUntil, ReplaySubject, filter } from 'rxjs';
import { StereoAudioRecorder } from 'recordrtc';
import { SpeechRecognitionService } from './../speech-recognition/speech-recognition.service';

@Injectable({
  providedIn: 'root',
})
export class RecordingService {
  private readonly SAMPLE_RATE = 16000;
  private stereoAudioRecorder!: StereoAudioRecorder;
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private silenceThreshold = 0.015;
  private silenceTimer: any;
  private isRecording = false;
  private processingChunks$: ReplaySubject<boolean> = new ReplaySubject(1);
  private chunksSubject$ = new Subject();
  private chunksToProcess: Array<Blob> = [];
  private audioChunks: Blob[] = [];
  private blobsToProcess$ = new Subject<Blob>();
  private readonly MIME_TYPE = 'audio/wav';

  public recordedChunk$ = new Subject<Float32Array>();

  constructor(private speechRecognitionService: SpeechRecognitionService) {}

  startRecording(): void {
    this.processingChunks$ = new ReplaySubject(1);

    this.blobsToProcess$
      .pipe(
        takeUntil(this.processingChunks$),
        concatMap(async (blob: any) => {
          const bufferLength = this.analyserNode!.fftSize;
          const dataArray = new Uint8Array(bufferLength);
          this.analyserNode!.getByteFrequencyData(dataArray);

          const averageAmplitude =
            dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;

          if (averageAmplitude < this.silenceThreshold * 255) {
            console.warn('SILENCE DETECTED');

            if (this.silenceTimer === null) {
              this.silenceTimer = setTimeout(async () => {
                if (this.audioChunks.length > 0) {
                  const wavBlob = await this.convertChunksToWAV(
                    this.audioChunks
                  );

                  this.emitChunk(wavBlob);
                  this.audioChunks = [];
                }

                this.silenceTimer = null;
              }, 100); // Tiempo de silencio de 100ms
            }
          } else {
            console.warn('RECORDING CHUNK');
            this.audioChunks.push(blob);

            if (this.silenceTimer !== null) {
              clearTimeout(this.silenceTimer);
              this.silenceTimer = null;
            }
          }
        })
      )
      .subscribe();

    this.chunksSubject$
      .pipe(
        takeUntil(this.processingChunks$),
        concatMap(async (blob: any) => {
          const arrayBuffer = await blob.arrayBuffer();

          if (arrayBuffer.byteLength === 0) {
            return null;
          }

          const audioBuffer = await this.audioContext?.decodeAudioData(
            arrayBuffer
          );

          if (!audioBuffer) {
            throw new Error('ERROR DECODING THE AUDIO');
          }

          const resampledBuffer = await this.resampleAudio(audioBuffer);
          const float32Array = this.getAudioData(resampledBuffer);
          const newFloat32Array = this.getAudioWithoutSilence(float32Array);

          if (newFloat32Array.length === 0) {
            return null;
          }

          this.recordedChunk$.next(float32Array);

          return blob;
        }),
        filter((chunk) => chunk !== null)
      )
      .subscribe({
        next: (processedChunk: Blob) => {
          this.chunksToProcess = this.chunksToProcess.filter(
            (chunk: Blob) => chunk !== processedChunk
          );
        },
        error: (error) => {
          console.error('ERROR PROCESSING THE CHUNK: ', error);
        },
      });

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream: MediaStream) => {
        if (!this.audioContext || !this.analyserNode) {
          const context = this.createAudioContext();
          const source = context.createMediaStreamSource(stream);
          this.analyserNode = context.createAnalyser();
          source.connect(this.analyserNode);
        }

        this.drawCanvas();

        this.stereoAudioRecorder = new StereoAudioRecorder(stream, {
          mimeType: this.MIME_TYPE,
          numberOfAudioChannels: 2,
          timeSlice: 100,
          ondataavailable: (blob) => this.blobsToProcess$.next(blob),
        });

        this.stereoAudioRecorder.record();
        this.isRecording = true;
      })
      .catch(console.error);
  }

  stopRecording() {
    this.speechRecognitionService.cancelTranscription();
    if (this.isRecording && this.stereoAudioRecorder) {
      this.isRecording = false;
      if (this.silenceTimer) clearTimeout(this.silenceTimer);

      this.audioContext?.close();
      this.audioContext = null;

      this.processingChunks$.next(true);
      this.processingChunks$.complete();

      this.stereoAudioRecorder.stop(() => {});
    }
  }

  private createAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }

  private emitChunk(blob: Blob) {
    this.chunksToProcess.push(blob);
    this.chunksSubject$.next(blob);
  }

  private async resampleAudio(audioBuffer: AudioBuffer): Promise<AudioBuffer> {
    const offlineContext = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      Math.round(audioBuffer.duration * this.SAMPLE_RATE),
      this.SAMPLE_RATE
    );
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start(0);

    return offlineContext.startRendering();
  }

  private getAudioData(filteredBuffer: AudioBuffer): Float32Array {
    const numChannels = filteredBuffer.numberOfChannels;
    const length = filteredBuffer.length;
    let filteredMonoData: Float32Array;

    if (numChannels === 1) {
      filteredMonoData = filteredBuffer.getChannelData(0);
    } else {
      const leftChannel = filteredBuffer.getChannelData(0);
      const rightChannel = filteredBuffer.getChannelData(1);
      filteredMonoData = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        filteredMonoData[i] = (leftChannel[i] + rightChannel[i]) / 2;
      }
    }

    return filteredMonoData;
  }

  private getAudioWithoutSilence(audioData: Float32Array): Float32Array {
    const threshold = 0.01; // Umbral de silencio
    const silenceDurationThreshold = 800; // Duración mínima del silencio (en muestras)

    let start = null;
    let end = null;
    const newData: number[] = [];

    // Recorremos los datos de audio y buscamos segmentos de silencio
    for (let i = 0; i < audioData.length; i++) {
      if (Math.abs(audioData[i]) < threshold) {
        if (start === null) start = i; // Detectamos el inicio del silencio
      } else {
        if (start !== null) {
          end = i; // Detectamos el final del silencio
          if (end - start > silenceDurationThreshold) {
            // Si el silencio es lo suficientemente largo, lo eliminamos
            continue;
          }
          start = null; // Reset de inicio del silencio
        }
        newData.push(audioData[i]); // Guardamos datos no silenciosos
      }
    }

    // Si el último fragmento no es silencio, lo agregamos
    if (start === null) {
      newData.push(...audioData.slice(end || 0));
    }

    // Si el audio es completamente vacío, retornamos un array vacío
    if (newData.length === 0) {
      console.warn('THE AUDIO IS EMPTY');
      return new Float32Array(0);
    }

    return new Float32Array(newData);
  }

  async convertChunksToWAV(
    chunks: Blob[],
    sampleRate = 44100,
    numChannels = 1
  ): Promise<Blob> {
    const audioContext = new AudioContext({ sampleRate });
    const buffers: AudioBuffer[] = [];

    for (const chunk of chunks) {
      const arrayBuffer = await chunk.arrayBuffer();
      const decoded = await audioContext.decodeAudioData(arrayBuffer);
      buffers.push(decoded);
    }

    // Concatenar todos los canales (solo canal 0 si es mono)
    const totalLength = buffers.reduce((acc, buf) => acc + buf.length, 0);
    const floatPCM = new Float32Array(totalLength);
    let offset = 0;

    for (const buf of buffers) {
      floatPCM.set(buf.getChannelData(0), offset);
      offset += buf.length;
    }

    const intPCM = this.floatTo16BitPCM(floatPCM);
    return this.encodeWAV(intPCM, sampleRate, numChannels);
  }

  floatTo16BitPCM(floatSamples: Float32Array): Int16Array {
    const int16 = new Int16Array(floatSamples.length);
    for (let i = 0; i < floatSamples.length; i++) {
      let s = Math.max(-1, Math.min(1, floatSamples[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16;
  }

  encodeWAV(samples: Int16Array, sampleRate = 44100, numChannels = 1): Blob {
    const blockAlign = numChannels * 2;
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples.length * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    let offset = 0;

    function writeString(str: string) {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset++, str.charCodeAt(i));
      }
    }

    // Header
    writeString('RIFF');
    view.setUint32(offset, 36 + dataSize, true);
    offset += 4;
    writeString('WAVE');
    writeString('fmt ');
    view.setUint32(offset, 16, true);
    offset += 4;
    view.setUint16(offset, 1, true);
    offset += 2;
    view.setUint16(offset, numChannels, true);
    offset += 2;
    view.setUint32(offset, sampleRate, true);
    offset += 4;
    view.setUint32(offset, byteRate, true);
    offset += 4;
    view.setUint16(offset, blockAlign, true);
    offset += 2;
    view.setUint16(offset, 16, true);
    offset += 2;
    writeString('data');
    view.setUint32(offset, dataSize, true);
    offset += 4;

    for (let i = 0; i < samples.length; i++, offset += 2) {
      view.setInt16(offset, samples[i], true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  private drawCanvas(): void {
    if (this.analyserNode === null) {
      return;
    }

    this.analyserNode.fftSize = 2048;
    const bufferLength = this.analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const canvas = document.getElementById('waveform') as HTMLCanvasElement;
    const canvasCtx = canvas.getContext('2d');

    const draw = () => {
      requestAnimationFrame(draw);

      if (!this.analyserNode || !canvasCtx) return;
      this.analyserNode.getByteTimeDomainData(dataArray);

      canvasCtx.fillStyle = 'rgb(240, 240, 240)';
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

      canvasCtx.lineWidth = 2;
      canvasCtx.strokeStyle = 'rgb(0, 0, 0)';
      canvasCtx.beginPath();

      const sliceWidth = (canvas.width * 1.0) / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0; // Convertir el valor a un rango [0, 2]
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      canvasCtx.lineTo(canvas.width, canvas.height / 2);
      canvasCtx.stroke();
    };

    draw();
    // Dibujar onda en el canvas
  }
}
