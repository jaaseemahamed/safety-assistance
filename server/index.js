const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { FilesetResolver, FaceLandmarker } = require('@mediapipe/tasks-vision');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Configure Multer for memory upload
const upload = multer({ storage: multer.memoryStorage() });

let faceLandmarker = null;

// Initialize MediaPipe FaceLandmarker
async function initializeFaceLandmarker() {
  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "CPU" // Use CPU for Node.js
      },
      numFaces: 1,
      runningMode: "IMAGE",
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    
    console.log("FaceLandmarker initialized successfully");
  } catch (error) {
    console.error("Error initializing FaceLandmarker:", error);
  }
}

// EAR Calculator
const calculateEAR = (eye) => {
  if (!eye || eye.length !== 6) return 0;
  
  const euclidean = (p1, p2) => {
    return Math.sqrt(
      Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)
    );
  };
  
  const A = euclidean(eye[1], eye[5]);
  const B = euclidean(eye[2], eye[4]);
  const C = euclidean(eye[0], eye[3]);
  
  const ear = (A + B) / (2.0 * C);
  return ear;
};

const getEyeLandmarks = (landmarks, eyeIndices) => {
  return eyeIndices.map(idx => landmarks[idx]);
};

// Indices for eyes (same as client-side)
const LEFT_EYE = [362, 385, 387, 263, 373, 380];
const RIGHT_EYE = [33, 160, 158, 133, 153, 144];
const EAR_THRESHOLD = 0.25;

initializeFaceLandmarker();

// API Endpoint
app.post('/analyze', upload.single('image'), async (req, res) => {
  if (!faceLandmarker) {
    return res.status(503).json({ error: "Model not initialized yet" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "No image file provided" });
  }

  try {
    const imagebuffer = req.file.buffer;
    const image = await loadImage(imagebuffer);
    
    // Create a canvas and draw the image to pass to MediaPipe
    // Note: MediaPipe Node API often accepts Canvas or Image objects
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);

    const results = faceLandmarker.detect(canvas);

    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
      const landmarks = results.faceLandmarks[0];
      
      const leftEye = getEyeLandmarks(landmarks, LEFT_EYE);
      const rightEye = getEyeLandmarks(landmarks, RIGHT_EYE);
      
      const leftEAR = calculateEAR(leftEye);
      const rightEAR = calculateEAR(rightEye);
      const avgEAR = (leftEAR + rightEAR) / 2.0;
      
      const isEyesClosed = avgEAR < EAR_THRESHOLD;

      res.json({
        success: true,
        ear: avgEAR,
        isEyesClosed: isEyesClosed,
        details: {
          leftEAR,
          rightEAR,
          threshold: EAR_THRESHOLD
        }
      });
    } else {
      res.json({
        success: false,
        error: "No face detected"
      });
    }
  } catch (err) {
    console.error("Processing error:", err);
    res.status(500).json({ error: "Failed to process image", details: err.message });
  }
});

app.listen(port, () => {
  console.log(`Drowsiness Detection API running at http://localhost:${port}`);
});
