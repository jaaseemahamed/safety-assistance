import logging
import os
import cv2
import mediapipe as mp
import numpy as np
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("drowsiness_detector.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Setup Flask with static folder pointing to React build
# Assuming app.py is in /server and build is in /dist (project root)
# The static_folder path is relative to where this script is run or absolute
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(os.path.dirname(CURRENT_DIR), 'dist')

app = Flask(__name__, static_folder=DIST_DIR, static_url_path='/')
CORS(app)

# Initialize FaceLandmarker
try:
    model_path = os.path.abspath('face_landmarker.task')
    if not os.path.exists(model_path):
        # Try finding it in the same directory as this script
        model_path = os.path.join(CURRENT_DIR, 'face_landmarker.task')
    
    logger.info(f"Loading FaceLandmarker model from: {model_path}")

    BaseOptions = mp.tasks.BaseOptions
    FaceLandmarker = mp.tasks.vision.FaceLandmarker
    FaceLandmarkerOptions = mp.tasks.vision.FaceLandmarkerOptions
    VisionRunningMode = mp.tasks.vision.RunningMode

    options = FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=model_path),
        running_mode=VisionRunningMode.IMAGE,
        num_faces=1,
        min_face_detection_confidence=0.5,
        min_face_presence_confidence=0.5,
        min_tracking_confidence=0.5)

    detector = FaceLandmarker.create_from_options(options)
    logger.info("FaceLandmarker initialized successfully")

except Exception as e:
    logger.error(f"Failed to initialize FaceLandmarker: {e}")
    detector = None

# Eye indices
LEFT_EYE = [362, 385, 387, 263, 373, 380]
RIGHT_EYE = [33, 160, 158, 133, 153, 144]
EAR_THRESHOLD = 0.25

def calculate_ear(landmarks, eye_indices):
    def euclidean(p1, p2):
        return np.linalg.norm(np.array([p1.x, p1.y]) - np.array([p2.x, p2.y]))

    p1 = landmarks[eye_indices[1]]
    p5 = landmarks[eye_indices[5]]
    p2 = landmarks[eye_indices[2]]
    p4 = landmarks[eye_indices[4]]
    p0 = landmarks[eye_indices[0]]
    p3 = landmarks[eye_indices[3]]

    A = euclidean(p1, p5)
    B = euclidean(p2, p4)
    C = euclidean(p0, p3)

    ear = (A + B) / (2.0 * C)
    return ear

@app.route('/analyze', methods=['POST'])
def analyze():
    if detector is None:
        return jsonify({'error': 'Model not initialized'}), 503

    if 'image' not in request.files:
        return jsonify({'error': 'No image file provided'}), 400

    file = request.files['image']
    
    try:
        file_bytes = np.frombuffer(file.read(), np.uint8)
        image = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

        if image is None:
             return jsonify({'error': 'Failed to decode image'}), 400

        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=image_rgb)
        
        results = detector.detect(mp_image)

        if results.face_landmarks and len(results.face_landmarks) > 0:
            landmarks = results.face_landmarks[0]
            
            left_ear = calculate_ear(landmarks, LEFT_EYE)
            right_ear = calculate_ear(landmarks, RIGHT_EYE)
            avg_ear = (left_ear + right_ear) / 2.0
            
            is_eyes_closed = avg_ear < EAR_THRESHOLD

            logger.info(f"Analyzed image. EAR: {avg_ear:.3f}, Drowsy: {is_eyes_closed}")

            return jsonify({
                'success': True,
                'ear': float(avg_ear),
                'isEyesClosed': bool(is_eyes_closed),
                'details': {
                    'leftEAR': float(left_ear),
                    'rightEAR': float(right_ear),
                    'threshold': EAR_THRESHOLD
                }
            })
        else:
            logger.info("No face detected in image")
            return jsonify({
                'success': False,
                'error': 'No face detected'
            })

    except Exception as e:
        logger.error(f"Error processing image: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    # In production/deployment, running this script directly will use Flask's dev server.
    # For robust deployment, consider using a WSGI server like waitress or gunicorn.
    # But for a simple self-contained program, this is functional.
    logger.info("Starting Drowsiness Detector Application...")
    app.run(host='0.0.0.0', port=5000, debug=False)
