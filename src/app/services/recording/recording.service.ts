import { Injectable } from '@angular/core';
import * as RecordRTC from 'recordrtc';
import { Subject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class RecordingService {
  private readonly SAMPLE_RATE = 16000;
  private record: any;

  private readonly MEDIA_CONTRAINTS = {
    video: false,
    audio: true,
  };
  private readonly RECORDING_OPTIONS: RecordRTC.Options = {
    mimeType: 'audio/wav',
    numberOfAudioChannels: 2,
    // timeSlice: 100,
    // sampleRate: 16000,
  };

  /**
   * Start recording.
   */
  initiateRecording(): void {
    navigator.mediaDevices
      .getUserMedia(this.MEDIA_CONTRAINTS)
      .then((stream: MediaStream) => {
        //Start Actual Recording
        var StereoAudioRecorder = RecordRTC.StereoAudioRecorder;
        this.record = new StereoAudioRecorder(stream, this.RECORDING_OPTIONS);
        this.record.record();
      })
      .catch(console.error);
  }

  /**
   * Stop recording.
   */
  stopRecording(): Observable<Float32Array> {
    const subject = new Subject<Float32Array>();

    this.record.stop(async (blob: Blob) => {
      const arrayBuffer = await blob.arrayBuffer();
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Convertir a 16kHz
      const resampledBuffer = await this.resampleAudio(audioBuffer);
      // const float32Array = resampledBuffer.getChannelData(0); // Obtener datos de audio

      // Obtener datos de audio de acuerdo a si está grabado como mono, o stereo
      const float32Array = this.getAudioData(resampledBuffer);

      subject.next(float32Array);
    });

    return subject.asObservable();
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

  private getAudioData(audioBuffer: AudioBuffer): Float32Array {
    const numChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const monoData = new Float32Array(length);

    // 🔹 Si es mono, devolver directamente
    if (numChannels === 1) {
      return audioBuffer.getChannelData(0);
    }

    // 🔹 Si es estéreo, mezclar canales
    const leftChannel = audioBuffer.getChannelData(0);
    const rightChannel = audioBuffer.getChannelData(1);

    for (let i = 0; i < length; i++) {
      monoData[i] = (leftChannel[i] + rightChannel[i]) / 2; // Promedio de los canales
    }

    return monoData;
  }
}
