import { Injectable } from '@angular/core';
import { Subject, interval, takeUntil } from 'rxjs';
import { StereoAudioRecorder } from 'recordrtc';

@Injectable({
  providedIn: 'root',
})
export class RecordingService {
  public audioChunk$ = new Subject<Blob>();

  private stereoAudioRecorder!: StereoAudioRecorder;
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private isRecording = false;
  private stopRecording$ = new Subject<void>();

  private audioBlobs: Blob[] = [];
  private readonly MAX_BLOBS = 8; // ~2 segundos (250ms * 8)
  private readonly MIN_BLOBS_FOR_CHUNK = 4; // ~1 segundo

  private readonly SAMPLE_RATE = 16000;
  private readonly SILENCE_THRESHOLD = 0.01;

  startRecording(): void {
    this.stopRecording$ = new Subject<void>();
    this.audioBlobs = [];

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
      timeSlice: 250,
      ondataavailable: (blob) => this.processAudioBlob(blob),
    });
  }

  private startContinuousProcessing() {
    interval(500)
      .pipe(takeUntil(this.stopRecording$))
      .subscribe(() => {
        if (this.audioBlobs.length >= this.MIN_BLOBS_FOR_CHUNK) {
          this.emitAudioChunk();
        }
      });
  }

  private async processAudioBlob(blob: Blob) {
    if (blob.size === 0) return;

    // 👈 Solo verificar silencio si quieres (opcional)
    const hasAudio = await this.blobHasAudio(blob);
    if (!hasAudio) return;

    // Agregar al buffer circular de Blobs
    this.audioBlobs.push(blob);

    // Mantener solo los últimos MAX_BLOBS
    if (this.audioBlobs.length > this.MAX_BLOBS) {
      this.audioBlobs.shift(); // Remover el más antiguo
    }
  }

  private emitAudioChunk() {
    if (this.audioBlobs.length < this.MIN_BLOBS_FOR_CHUNK) return;

    // Combinar los últimos blobs en uno solo
    const chunksToSend = this.audioBlobs.slice(-this.MIN_BLOBS_FOR_CHUNK);
    const combinedBlob = new Blob(chunksToSend, { type: 'audio/wav' });

    this.audioChunk$.next(combinedBlob);

    this.audioBlobs = this.audioBlobs.slice(this.MIN_BLOBS_FOR_CHUNK);
  }

  // 👈 Función opcional para detectar silencio en Blob
  private async blobHasAudio(blob: Blob): Promise<boolean> {
    if (!this.audioContext) return true; // Si no hay contexto, asumir que tiene audio

    try {
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      const channelData = audioBuffer.getChannelData(0);

      const rms = Math.sqrt(
        channelData.reduce((sum, sample) => sum + sample * sample, 0) /
          channelData.length
      );
      return rms > this.SILENCE_THRESHOLD;
    } catch {
      return true; // En caso de error, asumir que tiene audio
    }
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
