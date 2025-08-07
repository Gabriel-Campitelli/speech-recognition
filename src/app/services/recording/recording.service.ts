import { Injectable } from '@angular/core';
import { Subject, interval, takeUntil } from 'rxjs';
import { StereoAudioRecorder } from 'recordrtc';

@Injectable({
  providedIn: 'root',
})
export class RecordingService {
  public audioChunk$ = new Subject<Float32Array>();

  private stereoAudioRecorder!: StereoAudioRecorder;
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private isRecording = false;
  private stopRecording$ = new Subject<void>();

  // Buffer circular para acumular audio
  private audioBuffer: Float32Array = new Float32Array(0);
  private readonly BUFFER_SIZE = 16000 * 2; // 2 segundos de audio a 16kHz
  private readonly CHUNK_SIZE = 16000 * 1; // 1 segundo de audio

  private readonly SAMPLE_RATE = 16000;
  private readonly SILENCE_THRESHOLD = 0.01;

  startRecording(): void {
    this.stopRecording$ = new Subject<void>();
    this.audioBuffer = new Float32Array(0);

    navigator.mediaDevices
      .getUserMedia({
        audio: {
          sampleRate: this.SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      .then((stream: MediaStream) => {
        this.setupAudioContext(stream);
        this.setupRecorder(stream);
        this.startContinuousProcessing();

        this.stereoAudioRecorder.record();
        this.isRecording = true;
      })
      .catch(console.error);
  }

  private setupAudioContext(stream: MediaStream) {
    this.audioContext = new AudioContext({ sampleRate: this.SAMPLE_RATE });
    const source = this.audioContext.createMediaStreamSource(stream);
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 2048;
    source.connect(this.analyserNode);

    this.drawCanvas(); // <-- asegurate de llamarlo acá
  }

  private setupRecorder(stream: MediaStream) {
    this.stereoAudioRecorder = new StereoAudioRecorder(stream, {
      mimeType: 'audio/wav',
      numberOfAudioChannels: 1,
      timeSlice: 250, // Chunks más frecuentes (250ms)
      ondataavailable: (blob) => this.processAudioBlob(blob),
    });
  }

  private startContinuousProcessing() {
    // Procesar chunks cada 500ms para mayor fluidez
    interval(500)
      .pipe(takeUntil(this.stopRecording$))
      .subscribe(() => {
        if (this.audioBuffer.length >= this.CHUNK_SIZE) {
          this.emitAudioChunk();
        }
      });
  }

  private async processAudioBlob(blob: Blob) {
    if (!this.audioContext || blob.size === 0) return;

    try {
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      const float32Data = this.extractMonoAudio(audioBuffer);

      // Agregar al buffer circular
      this.addToBuffer(float32Data);
    } catch (error) {
      console.error('Error processing audio blob:', error);
    }
  }

  private extractMonoAudio(audioBuffer: AudioBuffer): Float32Array {
    const channelData = audioBuffer.getChannelData(0);
    return new Float32Array(channelData);
  }

  private addToBuffer(newData: Float32Array) {
    // Crear nuevo buffer combinado
    const combinedLength = this.audioBuffer.length + newData.length;
    const newBuffer = new Float32Array(combinedLength);

    newBuffer.set(this.audioBuffer);
    newBuffer.set(newData, this.audioBuffer.length);

    // Mantener solo los últimos BUFFER_SIZE samples
    if (combinedLength > this.BUFFER_SIZE) {
      const startIndex = combinedLength - this.BUFFER_SIZE;
      this.audioBuffer = newBuffer.slice(startIndex);
    } else {
      this.audioBuffer = newBuffer;
    }
  }

  private emitAudioChunk() {
    if (this.audioBuffer.length < this.CHUNK_SIZE) return;

    // Tomar chunk del final del buffer
    const chunk = this.audioBuffer.slice(-this.CHUNK_SIZE);

    // Verificar que no sea solo silencio
    if (this.hasAudio(chunk)) {
      this.audioChunk$.next(chunk);
    }
  }

  private hasAudio(audioData: Float32Array): boolean {
    const rms = Math.sqrt(
      audioData.reduce((sum, sample) => sum + sample * sample, 0) /
        audioData.length
    );
    return rms > this.SILENCE_THRESHOLD;
  }

  stopRecording() {
    this.isRecording = false;
    this.stopRecording$.next();
    this.stopRecording$.complete();

    if (this.stereoAudioRecorder) {
      this.stereoAudioRecorder.stop(() => {});
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  private drawCanvas(): void {
    if (!this.analyserNode) return;

    this.analyserNode.fftSize = 2048;
    const bufferLength = this.analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const canvas = document.getElementById('waveform') as HTMLCanvasElement;
    if (!canvas) return;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const draw = () => {
      if (!this.analyserNode) return; // por si se detiene la grabación

      requestAnimationFrame(draw);

      this.analyserNode.getByteTimeDomainData(dataArray);

      canvasCtx.fillStyle = 'rgb(240, 240, 240)';
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

      canvasCtx.lineWidth = 2;
      canvasCtx.strokeStyle = 'rgb(0, 0, 0)';
      canvasCtx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
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
  }
}
