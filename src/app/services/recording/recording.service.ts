import { Injectable } from '@angular/core';
import { Subject, interval, takeUntil } from 'rxjs';
import { StereoAudioRecorder } from 'recordrtc';

// Voice Activity Detection (VAD)
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

  // 🎯 Configuración inteligente para VAD
  private readonly SAMPLE_RATE = 16000;
  private readonly SILENCE_THRESHOLD = 0.01;
  private readonly MIN_SPEECH_DURATION = 500; // mínimo 500ms de habla para procesar
  private readonly SILENCE_DURATION_TO_PROCESS = 800; // 800ms de silencio → procesar
  private readonly MAX_SPEECH_DURATION = 8000; // máximo 8s sin procesar → forzar chunk

  // 📊 Estado de detección de voz
  private isSpeaking = false;
  private lastSpeechTime = 0;
  private speechStartTime = 0;
  private silenceStartTime = 0;

  // Mantener un buffer razonable (no más de 15 segundos)
  private MAX_BLOBS = Math.floor(15000 / 100); // 15s / 100ms

  startRecording(): void {
    this.stopRecording$ = new Subject<void>();
    this.audioBlobs = [];
    this.resetVADState();

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
        this.startIntelligentProcessing(); // 👈 Nuevo método inteligente

        this.stereoAudioRecorder.record();
        this.isRecording = true;
      })
      .catch(console.error);
  }

  private resetVADState() {
    this.isSpeaking = false;
    this.lastSpeechTime = 0;
    this.speechStartTime = 0;
    this.silenceStartTime = 0;
  }

  private setupAudioContext(stream: MediaStream) {
    this.audioContext = new AudioContext({ sampleRate: this.SAMPLE_RATE });
    const source = this.audioContext.createMediaStreamSource(stream);
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 2048;
    source.connect(this.analyserNode);
    this.drawCanvas();
  }

  private setupRecorder(stream: MediaStream) {
    this.stereoAudioRecorder = new StereoAudioRecorder(stream, {
      mimeType: 'audio/wav',
      numberOfAudioChannels: 1,
      timeSlice: 100, // 👈 Más frecuente para mejor detección VAD
      ondataavailable: (blob) => this.processAudioBlob(blob),
    });
  }

  // 🧠 Procesamiento inteligente basado en VAD
  private startIntelligentProcessing() {
    interval(100)
      .pipe(takeUntil(this.stopRecording$))
      .subscribe(() => {
        this.checkVoiceActivity();
      });
  }

  private async processAudioBlob(blob: Blob) {
    if (blob.size === 0) return;

    // Siempre agregar al buffer (necesitamos todo el audio)
    this.audioBlobs.push(blob);

    if (this.audioBlobs.length > this.MAX_BLOBS) {
      this.audioBlobs.shift();
    }
  }

  // 🎤 Detección inteligente de actividad de voz
  private async checkVoiceActivity() {
    if (!this.audioContext || this.audioBlobs.length === 0) return;

    const currentTime = Date.now();

    // Analizar el último blob para detectar voz
    const lastBlob = this.audioBlobs[this.audioBlobs.length - 1];
    const hasVoice = await this.blobHasAudio(lastBlob);

    // 🗣️ Transición: Silencio → Hablando
    if (hasVoice && !this.isSpeaking) {
      this.isSpeaking = true;
      this.speechStartTime = currentTime;
      this.silenceStartTime = 0;
      console.log('🎤 Empezó a hablar');
    }

    // 🤫 Transición: Hablando → Silencio
    else if (!hasVoice && this.isSpeaking) {
      this.isSpeaking = false;
      this.lastSpeechTime = currentTime;
      this.silenceStartTime = currentTime;
      console.log('🤫 Dejó de hablar');
    }

    // 📝 Decidir cuándo procesar
    this.decideWhenToProcess(currentTime);
  }

  private decideWhenToProcess(currentTime: number) {
    const speechDuration = this.isSpeaking
      ? currentTime - this.speechStartTime
      : this.lastSpeechTime - this.speechStartTime;

    const silenceDuration =
      this.silenceStartTime > 0 ? currentTime - this.silenceStartTime : 0;

    // 🎯 Caso 1: Terminó de hablar + suficiente silencio
    if (
      !this.isSpeaking &&
      silenceDuration >= this.SILENCE_DURATION_TO_PROCESS &&
      speechDuration >= this.MIN_SPEECH_DURATION &&
      this.audioBlobs.length > 0
    ) {
      console.log(
        `✅ Procesando por silencio (${speechDuration}ms de habla, ${silenceDuration}ms de silencio)`
      );
      this.emitAudioChunk('silence_detected');
      return;
    }

    // 🎯 Caso 2: Hablando demasiado tiempo → chunk parcial
    if (
      this.isSpeaking &&
      speechDuration >= this.MAX_SPEECH_DURATION &&
      this.audioBlobs.length > 0
    ) {
      console.log(
        `⏰ Procesando por duración máxima (${speechDuration}ms de habla continua)`
      );
      this.emitPartialChunk();
      return;
    }
  }

  // 📤 Emitir chunk completo (cuando detectamos silencio)
  private emitAudioChunk(reason: string) {
    if (this.audioBlobs.length === 0) return;

    console.log(
      `📤 Enviando chunk completo: ${this.audioBlobs.length} blobs, razón: ${reason}`
    );

    // 🔧 SOLUCIÓN: Usar RecordRTC para combinar WAVs correctamente
    this.combineAudioBlobs(this.audioBlobs)
      .then((combinedBlob) => {
        console.log(
          `✅ Blob combinado correctamente, size: ${combinedBlob.size}`
        );
        this.audioChunk$.next(combinedBlob);
      })
      .catch((error) => {
        console.error('❌ Error combinando audio:', error);
      });

    // Limpiar buffer después de procesar
    this.audioBlobs = [];
    this.resetVADState();
  }

  // 📤 Emitir chunk parcial (para habla muy larga)
  private emitPartialChunk() {
    if (this.audioBlobs.length === 0) return;

    // Tomar los primeros 3/4 del buffer, dejar 1/4 para contexto
    const chunkSize = Math.floor(this.audioBlobs.length * 0.75);
    const chunksToSend = this.audioBlobs.slice(0, chunkSize);

    console.log(`📤 Enviando chunk parcial: ${chunksToSend.length} blobs`);

    // 🔧 SOLUCIÓN: Usar RecordRTC para combinar WAVs correctamente
    this.combineAudioBlobs(chunksToSend)
      .then((combinedBlob) => {
        console.log(`✅ Chunk parcial combinado, size: ${combinedBlob.size}`);
        this.audioChunk$.next(combinedBlob);
      })
      .catch((error) => {
        console.error('❌ Error combinando chunk parcial:', error);
      });

    // Mantener el último 1/4 para contexto
    this.audioBlobs = this.audioBlobs.slice(chunkSize);

    // Resetear timer de habla para el próximo chunk
    this.speechStartTime = Date.now();
  }

  private async combineAudioBlobs(blobs: Blob[]): Promise<Blob> {
    return new Promise((resolve, reject) => {
      try {
        // Usar la función global ConcatenateBlobs de RecordRTC para combinar WAVs
        (window as any).ConcatenateBlobs(
          blobs,
          'audio/wav',
          (combinedBlob: Blob) => {
            resolve(combinedBlob);
          }
        );
      } catch (error) {
        // Fallback: si RecordRTC no tiene ConcatenateBlobs, usar método manual
        this.manualCombineWavBlobs(blobs).then(resolve).catch(reject);
      }
    });
  }

  private async manualCombineWavBlobs(blobs: Blob[]): Promise<Blob> {
    if (blobs.length === 0) return new Blob([], { type: 'audio/wav' });
    if (blobs.length === 1) return blobs[0];

    try {
      // Convertir todos los blobs a ArrayBuffers
      const arrayBuffers = await Promise.all(
        blobs.map((blob) => blob.arrayBuffer())
      );

      // Extraer solo los datos de audio (sin cabeceras WAV)
      const audioDataArrays: Uint8Array[] = [];
      let sampleRate = 16000;
      let channels = 1;

      for (const buffer of arrayBuffers) {
        const view = new DataView(buffer);

        // Leer cabecera WAV para obtener info
        if (buffer.byteLength > 44) {
          sampleRate = view.getUint32(24, true); // Sample rate
          channels = view.getUint16(22, true); // Channels

          // Extraer solo los datos de audio (después de la cabecera de 44 bytes)
          const audioData = new Uint8Array(buffer, 44);
          audioDataArrays.push(audioData);
        }
      }

      // Combinar todos los datos de audio
      const totalLength = audioDataArrays.reduce(
        (sum, arr) => sum + arr.length,
        0
      );
      const combinedAudioData = new Uint8Array(totalLength);

      let offset = 0;
      for (const audioData of audioDataArrays) {
        combinedAudioData.set(audioData, offset);
        offset += audioData.length;
      }

      // Crear nueva cabecera WAV
      const wavHeader = this.createWavHeader(
        combinedAudioData.length,
        sampleRate,
        channels
      );

      // Combinar cabecera + datos
      const finalBuffer = new Uint8Array(
        wavHeader.length + combinedAudioData.length
      );
      finalBuffer.set(wavHeader, 0);
      finalBuffer.set(combinedAudioData, wavHeader.length);

      return new Blob([finalBuffer], { type: 'audio/wav' });
    } catch (error) {
      console.error('Error en combinación manual:', error);
      // Fallback: devolver el primer blob
      return blobs[0];
    }
  }

  private createWavHeader(
    dataLength: number,
    sampleRate: number,
    channels: number
  ): Uint8Array {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    // RIFF header
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + dataLength, true); // File size
    view.setUint32(8, 0x57415645, false); // "WAVE"

    // fmt chunk
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true); // Chunk size
    view.setUint16(20, 1, true); // Audio format (PCM)
    view.setUint16(22, channels, true); // Channels
    view.setUint32(24, sampleRate, true); // Sample rate
    view.setUint32(28, sampleRate * channels * 2, true); // Byte rate
    view.setUint16(32, channels * 2, true); // Block align
    view.setUint16(34, 16, true); // Bits per sample

    // data chunk
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, dataLength, true); // Data size

    return new Uint8Array(header);
  }

  // 🔊 Detección de audio mejorada
  private async blobHasAudio(blob: Blob): Promise<boolean> {
    if (!this.audioContext) return false;

    try {
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      const channelData = audioBuffer.getChannelData(0);

      // RMS (Root Mean Square) para detectar energía
      const rms = Math.sqrt(
        channelData.reduce((sum, sample) => sum + sample * sample, 0) /
          channelData.length
      );

      return rms > this.SILENCE_THRESHOLD;
    } catch {
      return false;
    }
  }

  stopRecording() {
    // Procesar cualquier audio pendiente antes de parar
    if (this.audioBlobs.length > 0) {
      this.emitAudioChunk('recording_stopped');
    }

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
      if (!this.analyserNode) return;

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
