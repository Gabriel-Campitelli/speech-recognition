// speech-worker.js
import { pipeline } from "@huggingface/transformers";

let recognitionPipeline = null;

const initializePipeline = async () => {
  if (!recognitionPipeline) {
    recognitionPipeline = await pipeline(
      "automatic-speech-recognition",
      "onnx-community/whisper-tiny"
    );
  }
};

self.onmessage = async function (e) {
  const { id, audioData, config } = e.data;

  try {
    await initializePipeline();

    const result = await recognitionPipeline(audioData, config);

    self.postMessage({
      id,
      success: true,
      text: result.text,
      timestamp: Date.now(),
    });
  } catch (error) {
    self.postMessage({
      id,
      success: false,
      error: error.message,
      timestamp: Date.now(),
    });
  }
};
