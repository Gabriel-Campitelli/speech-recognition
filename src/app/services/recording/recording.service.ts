import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import * as RecordRTC from 'recordrtc';
import { SpeechRecognitionService } from './../speech-recognition/speech-recognition.service';

enum RecordingEvent {
  SilenceDetected,
  RecordingStopped,
}

@Injectable({
  providedIn: 'root',
})
export class RecordingService {
  private readonly SAMPLE_RATE = 16000;
  private stereoAudioRecorder: any;
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private silenceThreshold = 0.008;
  private silenceDuration = 200;
  private silenceTimer: any;
  private isRecording = false;
  private filters: BiquadFilterNode[] = [];

  public recordedChunk$ = new Subject<Float32Array>();

  constructor(private speechRecognitionService: SpeechRecognitionService) {}

  private createAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }

  private createFilters() {
    const context = this.createAudioContext();

    if (this.filters.length === 0) {
      this.filters.push(this.getHighPassFilter(context));
      this.filters.push(this.getLowPassFilter(context));
    }
  }

  private getHighPassFilter(audioContext: AudioContext): BiquadFilterNode {
    const highPassFilter = audioContext.createBiquadFilter();
    highPassFilter.type = 'highpass';
    highPassFilter.frequency.value = 500;
    highPassFilter.Q.value = 1;
    return highPassFilter;
  }

  private getLowPassFilter(audioContext: AudioContext): BiquadFilterNode {
    const lowPassFilter = audioContext.createBiquadFilter();
    lowPassFilter.type = 'lowpass';
    lowPassFilter.frequency.value = 3000;
    lowPassFilter.Q.value = 1;
    return lowPassFilter;
  }

  private getAudioWithoutSilence(audioData: Float32Array): Float32Array {
    const threshold = 0.01;
    const silenceSegments = [];
    let start = null;

    for (let i = 0; i < audioData.length; i++) {
      if (Math.abs(audioData[i]) < threshold) {
        if (start === null) start = i;
      } else if (start !== null) {
        silenceSegments.push({ start, end: i });
        start = null;
      }
    }

    if (start !== null) silenceSegments.push({ start, end: audioData.length });

    let currentIndex = 0;
    const newData = silenceSegments.reduce((acc, { start, end }) => {
      acc.push(...audioData.slice(currentIndex, start));
      currentIndex = end;
      return acc;
    }, [] as number[]);

    if (currentIndex < audioData.length)
      newData.push(...audioData.slice(currentIndex));

    if (newData.length === 0) {
      console.warn('El audio resultante está vacío.');
      return new Float32Array(0);
    }

    return new Float32Array(newData);
  }

  private emitChunk(recordingEvent: RecordingEvent) {
    this.stereoAudioRecorder.stop(async (blob: Blob) => {
      if (blob) {
        const arrayBuffer = await blob.arrayBuffer();
        this.audioContext
          ?.decodeAudioData(arrayBuffer)
          .then(async (audioBuffer: AudioBuffer) => {
            const resampledBuffer = await this.resampleAudio(audioBuffer);

            const float32Array = this.getAudioData(resampledBuffer);
            const newFloat32Array = this.getAudioWithoutSilence(float32Array);

            if (newFloat32Array.length > 0) {
              if (recordingEvent !== RecordingEvent.RecordingStopped) {
                this.recordedChunk$.next(float32Array);
              }

              if (recordingEvent === RecordingEvent.SilenceDetected) {
                this.stereoAudioRecorder.record();
              }
            } else {
              console.log('Audio vacío, reiniciando grabación...');

              this.stopRecording();
              this.startRecording();
            }
          });
      }

      if (recordingEvent === RecordingEvent.RecordingStopped) {
        this.audioContext?.close();
        this.audioContext = null;
      }
    });
  }

  startRecording(): void {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream: MediaStream) => {
        const context = this.createAudioContext();
        const source = context.createMediaStreamSource(stream);
        this.analyserNode = context.createAnalyser();
        source.connect(this.analyserNode);

        this.stereoAudioRecorder = new RecordRTC.StereoAudioRecorder(stream, {
          mimeType: 'audio/wav',
          numberOfAudioChannels: 2,
          timeSlice: 500,
        });

        this.stereoAudioRecorder.record();
        this.isRecording = true;

        this.detectSilence();
      })
      .catch(console.error);
  }

  stopRecording() {
    this.speechRecognitionService.cancelTranscription();
    if (this.isRecording && this.stereoAudioRecorder) {
      this.isRecording = false;
      this.emitChunk(RecordingEvent.RecordingStopped);
      if (this.silenceTimer) clearTimeout(this.silenceTimer);
    }
  }

  private detectSilence() {
    const bufferLength = this.analyserNode!.fftSize;
    const dataArray = new Uint8Array(bufferLength);

    const checkSilence = () => {
      if (!this.isRecording) return;

      this.analyserNode!.getByteFrequencyData(dataArray);
      const averageAmplitude =
        dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;

      if (averageAmplitude < this.silenceThreshold * 255) {
        if (!this.silenceTimer) {
          this.silenceTimer = setTimeout(() => {
            this.emitChunk(RecordingEvent.SilenceDetected);
          }, this.silenceDuration);
        }
      } else if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }

      requestAnimationFrame(checkSilence);
    };

    requestAnimationFrame(checkSilence);
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

  private reproduceAudio(float32Array: Float32Array) {
    const context = new AudioContext();
    const source = context.createBufferSource();
    const buffer = context.createBuffer(
      1,
      float32Array.length,
      this.SAMPLE_RATE
    );
    buffer.copyToChannel(float32Array, 0);
    source.buffer = buffer;
    source.connect(context.destination);
    source.start();
  }
}
