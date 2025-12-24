import React, { useState, useRef, useEffect } from 'react';
import { Camera, AlertTriangle, Settings, Power, Volume2, VolumeX, Info } from 'lucide-react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import '../App.css';

// Eye Aspect Ratio Calculator
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

const DrowsinessDetector = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [alertActive, setAlertActive] = useState(false);
  const [earValue, setEarValue] = useState(0);
  const [closedFrames, setClosedFrames] = useState(0);
  const [threshold, setThreshold] = useState(0.25);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [fps, setFps] = useState(0);
  const [error, setError] = useState('');
  const [cameraSource, setCameraSource] = useState('webcam'); // 'webcam' or 'ip'
  const [ipCameraUrl, setIpCameraUrl] = useState('');
  
  const faceLandmarkerRef = useRef(null);
  const audioContextRef = useRef(null);
  const animationFrameRef = useRef(null);
  const lastFrameTimeRef = useRef(0);
  const frameCountRef = useRef(0);
  const closedFrameCountRef = useRef(0);
  const oscillatorRef = useRef(null);
  const gainNodeRef = useRef(null);
  
  const CONSEC_FRAMES = 45;
  
  const LEFT_EYE = [362, 385, 387, 263, 373, 380];
  const RIGHT_EYE = [33, 160, 158, 133, 153, 144];

  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const initializeFaceLandmarker = async () => {
    try {
      setIsLoading(true);
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      
      faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU"
        },
        numFaces: 1,
        runningMode: "VIDEO",
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      
      setIsLoading(false);
      return true;
    } catch (err) {
      console.error("Error initializing Face Landmarker:", err);
      setError("Failed to load face detection model. Please refresh and try again.");
      setIsLoading(false);
      return false;
    }
  };

  const startCamera = async () => {
    try {
      setError('');
      console.log("Starting camera...");
      
      if (!faceLandmarkerRef.current) {
        console.log("Initializing face landmarker...");
        const initialized = await initializeFaceLandmarker();
        if (!initialized) return;
        console.log("Face landmarker initialized successfully!");
      }
      
      if (cameraSource === 'ip' && ipCameraUrl) {
        // IP Camera Mode
        console.log("Connecting to IP camera:", ipCameraUrl);
        if (videoRef.current) {
          videoRef.current.src = ipCameraUrl;
          videoRef.current.onloadedmetadata = () => {
            console.log("IP camera loaded, starting playback...");
            videoRef.current.play();
            setIsActive(true);
            console.log("Starting detection...");
            detectDrowsiness();
          };
          videoRef.current.onerror = (e) => {
            console.error("IP camera error:", e);
            setError("Failed to connect to IP camera. Check the URL and CORS settings.");
          };
        }
      } else {
        // Webcam Mode
        console.log("Requesting camera access...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 }
          }
        });
        
        console.log("Camera stream obtained!");
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            console.log("Video loaded, starting playback...");
            videoRef.current.play();
            setIsActive(true);
            console.log("Starting detection...");
            detectDrowsiness();
          };
        }
      }
    } catch (err) {
      console.error("Camera error:", err);
      setError(`Cannot access camera: ${err.message}. Please grant camera permissions.`);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    stopAlarm();
    setIsActive(false);
    setAlertActive(false);
    setClosedFrames(0);
    closedFrameCountRef.current = 0;
  };

  const playAlarm = () => {
    if (!soundEnabled || !audioContextRef.current) return;
    
    try {
      // Don't restart if already playing
      if (oscillatorRef.current) return;
      
      oscillatorRef.current = audioContextRef.current.createOscillator();
      gainNodeRef.current = audioContextRef.current.createGain();
      
      oscillatorRef.current.connect(gainNodeRef.current);
      gainNodeRef.current.connect(audioContextRef.current.destination);
      
      oscillatorRef.current.type = 'sine';
      gainNodeRef.current.gain.setValueAtTime(0.3, audioContextRef.current.currentTime);
      
      oscillatorRef.current.start();
      
      // Create continuous alternating alarm pattern
      const alternateFrequency = () => {
        if (!oscillatorRef.current) return;
        
        const now = audioContextRef.current.currentTime;
        oscillatorRef.current.frequency.setValueAtTime(800, now);
        oscillatorRef.current.frequency.setValueAtTime(1200, now + 0.3);
        oscillatorRef.current.frequency.setValueAtTime(800, now + 0.6);
        
        setTimeout(() => alternateFrequency(), 600);
      };
      
      alternateFrequency();
      
      console.log("Alarm started");
    } catch (err) {
      console.error("Audio error:", err);
    }
  };

  const stopAlarm = () => {
    if (oscillatorRef.current) {
      try {
        oscillatorRef.current.stop();
        oscillatorRef.current.disconnect();
        console.log("Alarm stopped");
      } catch {
        // Already stopped
      }
      oscillatorRef.current = null;
    }
    if (gainNodeRef.current) {
      try {
        gainNodeRef.current.disconnect();
      } catch {
        // Already disconnected
      }
      gainNodeRef.current = null;
    }
  };

  const detectDrowsiness = () => {
    const detect = async () => {
      if (!videoRef.current || !faceLandmarkerRef.current) {
        console.log("Detection stopped - missing refs");
        return;
      }
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const now = performance.now();
        frameCountRef.current++;
        if (now - lastFrameTimeRef.current >= 1000) {
          setFps(frameCountRef.current);
          frameCountRef.current = 0;
          lastFrameTimeRef.current = now;
        }
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        try {
          const results = faceLandmarkerRef.current.detectForVideo(video, now);
          
          if (results.faceLandmarks && results.faceLandmarks.length > 0) {
            const landmarks = results.faceLandmarks[0];
            
            const leftEye = getEyeLandmarks(landmarks, LEFT_EYE);
            const rightEye = getEyeLandmarks(landmarks, RIGHT_EYE);
            
            const leftEAR = calculateEAR(leftEye);
            const rightEAR = calculateEAR(rightEye);
            const ear = (leftEAR + rightEAR) / 2.0;
            
            setEarValue(ear);
            
            drawEyeContour(ctx, leftEye, canvas.width, canvas.height);
            drawEyeContour(ctx, rightEye, canvas.width, canvas.height);
            
            if (ear < threshold) {
              closedFrameCountRef.current++;
              setClosedFrames(closedFrameCountRef.current);
              
              if (closedFrameCountRef.current >= CONSEC_FRAMES) {
                if (!alertActive) {
                  setAlertActive(true);
                  playAlarm();
                }
              }
            } else {
              closedFrameCountRef.current = 0;
              setClosedFrames(0);
              if (alertActive) {
                setAlertActive(false);
                stopAlarm();
              }
            }
            
            if (alertActive) {
              ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              
              ctx.strokeStyle = '#ff0000';
              ctx.lineWidth = 10;
              ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
              
              ctx.fillStyle = '#ff0000';
              ctx.font = 'bold 40px Arial';
              ctx.textAlign = 'center';
              ctx.fillText('⚠️ DROWSINESS ALERT!', canvas.width / 2, 60);
            }
            
          } else {
            closedFrameCountRef.current = 0;
            setClosedFrames(0);
            setEarValue(0);
            if (alertActive) {
              setAlertActive(false);
              stopAlarm();
            }
          }
        } catch (err) {
          console.error("Detection error:", err);
        }
      }
      
      animationFrameRef.current = requestAnimationFrame(detect);
    };
    
    detect();
  };

  const drawEyeContour = (ctx, eye, width, height) => {
    ctx.beginPath();
    eye.forEach((point, i) => {
      const x = point.x * width;
      const y = point.y * height;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  useEffect(() => {
    const video = videoRef.current;
    const animationFrame = animationFrameRef.current;
    const oscillator = oscillatorRef.current;
    const gainNode = gainNodeRef.current;
    
    return () => {
      if (video && video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());
      }
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
      if (oscillator) {
        try {
          oscillator.stop();
          oscillator.disconnect();
        } catch {
          // Already stopped
        }
      }
      if (gainNode) {
        gainNode.disconnect();
      }
    };
  }, []);

  const progress = Math.min(100, (closedFrames / CONSEC_FRAMES) * 100);

  return (
    <div className="app-container">
      <div className="content-wrapper">
        {/* Header */}
        <div className="header">
          <h1 className="title">
            <Camera className="icon-large" />
            Drowsiness Detector
          </h1>
          <p className="subtitle">Real-time driver alertness monitoring</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="error-message">
            <AlertTriangle className="icon-small" />
            {error}
          </div>
        )}

        {/* Main Content */}
        <div className="main-card">
          {/* Video Container */}
          <div className="video-container">
            <video
              ref={videoRef}
              className="video-element"
              playsInline
              muted
              style={{ display: isActive ? 'block' : 'none' }}
            />
            <canvas
              ref={canvasRef}
              className="canvas-element"
              style={{ display: isActive ? 'block' : 'none' }}
            />
            
            {!isActive && (
              <div className="camera-off">
                <div className="camera-off-content">
                  <Camera className="icon-xlarge" />
                  <p className="camera-off-text">Camera Off</p>
                </div>
              </div>
            )}

            {/* FPS Counter */}
            {isActive && (
              <div className="fps-counter">
                <span>FPS: {fps}</span>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="controls-section">
            {/* Stats */}
            {isActive && (
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-label">Eye Aspect Ratio</div>
                  <div className="stat-value">{earValue.toFixed(3)}</div>
                  <div className="stat-sublabel">Threshold: {threshold.toFixed(2)}</div>
                </div>
                
                <div className="stat-card">
                  <div className="stat-label">Eyes Closed</div>
                  <div className="stat-value">{progress.toFixed(0)}%</div>
                  <div className="progress-bar">
                    <div 
                      className={`progress-fill ${progress >= 100 ? 'progress-danger' : 'progress-warning'}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="button-group">
              <button
                onClick={isActive ? stopCamera : startCamera}
                disabled={isLoading}
                className={`btn btn-primary ${isActive ? 'btn-stop' : 'btn-start'}`}
              >
                <Power className="icon-small" />
                {isLoading ? 'Loading...' : isActive ? 'Stop Detection' : 'Start Detection'}
              </button>
              
              {alertActive && (
                <button
                  onClick={() => {
                    setAlertActive(false);
                    stopAlarm();
                    closedFrameCountRef.current = 0;
                    setClosedFrames(0);
                  }}
                  className="btn btn-awake"
                >
                  <AlertTriangle className="icon-small" />
                  I'm Awake!
                </button>
              )}
              
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="btn btn-secondary"
              >
                <Settings className="icon-small" />
              </button>
              
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="btn btn-secondary"
              >
                {soundEnabled ? <Volume2 className="icon-small" /> : <VolumeX className="icon-small" />}
              </button>
            </div>

            {/* Settings Panel */}
            {showSettings && (
              <div className="settings-panel">
                <h3 className="settings-title">Settings</h3>
                
                <div className="setting-item">
                  <label className="setting-label">Camera Source</label>
                  <div className="camera-source-buttons">
                    <button
                      onClick={() => setCameraSource('webcam')}
                      className={`camera-btn ${cameraSource === 'webcam' ? 'active' : ''}`}
                    >
                      Webcam
                    </button>
                    <button
                      onClick={() => setCameraSource('ip')}
                      className={`camera-btn ${cameraSource === 'ip' ? 'active' : ''}`}
                    >
                      IP Camera
                    </button>
                  </div>
                </div>

                {cameraSource === 'ip' && (
                  <div className="setting-item">
                    <label className="setting-label">IP Camera URL</label>
                    <input
                      type="text"
                      value={ipCameraUrl}
                      onChange={(e) => setIpCameraUrl(e.target.value)}
                      placeholder="http://192.168.1.100:8080/video"
                      className="ip-input"
                      disabled={isActive}
                    />
                    <div className="ip-examples">
                      <p>Examples:</p>
                      <ul>
                        <li>MJPEG: http://IP:PORT/video</li>
                        <li>IP Webcam (Android): http://IP:8080/video</li>
                        <li>DroidCam: http://IP:4747/video</li>
                      </ul>
                    </div>
                  </div>
                )}
                
                <div className="setting-item">
                  <label className="setting-label">
                    Sensitivity Threshold: {threshold.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min="0.15"
                    max="0.35"
                    step="0.01"
                    value={threshold}
                    onChange={(e) => setThreshold(parseFloat(e.target.value))}
                    className="slider"
                  />
                  <div className="slider-labels">
                    <span>More Sensitive</span>
                    <span>Less Sensitive</span>
                  </div>
                </div>

                <div className="info-box">
                  <Info className="icon-small" />
                  <div className="info-content">
                    <p className="info-title">How it works:</p>
                    <ul className="info-list">
                      <li>Keep your face visible to the camera</li>
                      <li>Alert triggers after ~1.5 seconds of closed eyes</li>
                      <li>Adjust sensitivity if getting false alerts</li>
                      <li>Works best in good lighting conditions</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="footer">
          <p>⚠️ This is a safety assistance tool. Stay alert while driving.</p>
        </div>
      </div>
    </div>
  );
};

export default DrowsinessDetector;