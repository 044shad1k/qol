// Starts the webcam and the bundled MediaPipe hand tracker.
import { FilesetResolver, HandLandmarker } from '../vendor/vision_bundle.mjs';

export async function startCamera(video) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720, facingMode: 'user' },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
}

export async function createTracker() {
  const files = await FilesetResolver.forVisionTasks(new URL('../vendor/wasm', import.meta.url).href);
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: new URL('../vendor/hand_landmarker.task', import.meta.url).href, delegate },
    runningMode: 'VIDEO',
    numHands: 1,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });
  try {
    return await HandLandmarker.createFromOptions(files, options('GPU'));
  } catch {
    return HandLandmarker.createFromOptions(files, options('CPU'));
  }
}
