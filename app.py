from flask import Flask, render_template, request, jsonify, session, redirect, url_for, Response
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from datetime import datetime, timedelta
import pytz
import os
import base64
import mysql.connector
from functools import wraps
from dotenv import load_dotenv
# ML imports
import tensorflow as tf
import numpy as np
from PIL import Image
import io

# Camera Configuration - ADD THIS SECTION
CAMERA_ENABLED = os.environ.get('CAMERA_ENABLED', 'false').lower() == 'true'
CAMERA_URL = os.environ.get('CAMERA_URL', 'https://ekycf-2001-fd8-d45a-bc00-37b0-11b6-2ca4-f027.a.free.pinggy.link')

print(f"📷 Camera enabled: {CAMERA_ENABLED}")
if CAMERA_ENABLED:
    print(f"📡 Camera URL: {CAMERA_URL}")

# Load environment variables
load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'your-secret-key-change-this-in-production')
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

# Database configuration
DB_CONFIG = {
    'host': os.environ.get('DB_HOST', 'localhost'),
    'user': os.environ.get('DB_USER', 'root'),
    'password': os.environ.get('DB_PASSWORD', 'amnalangpogi16'),
    'database': os.environ.get('DB_NAME', 'hatchly_db')
}

# Allowed extensions
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}

# ML Model Configuration
MODEL_PATH = 'models/latest_model.h5'
model = None
BINARY_MODEL_PATH ='models/binary_model.keras'
binary_model = None

def load_ml_model():
    """Load the trained model"""
    global model
    try:
        from tensorflow.keras.models import load_model as load_keras_model
        model = load_keras_model(MODEL_PATH, compile=False)
        model.compile(
            optimizer='adam',
            loss='mae',
            metrics=['mae']
        )
        print(f"✅ Model loaded from {MODEL_PATH}")
        return True
    except Exception as e:
        print(f"❌ Error loading model: {e}")
        print(f"   Model will use dummy predictions")
        return False

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_db_connection():
    """Create database connection"""
    return mysql.connector.connect(**DB_CONFIG)

def login_required(f):
    """Decorator to require login"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'success': False, 'message': 'Login required'}), 401
        return f(*args, **kwargs)
    return decorated_function

def load_binary_model():
    """Load the binary classifier (prawn egg vs not prawn egg)"""
    global binary_model
    try:
        from tensorflow.keras.models import load_model as load_keras_model
        binary_model = load_keras_model(BINARY_MODEL_PATH)
        print(f"✅ Binary model loaded from {BINARY_MODEL_PATH}")
        return True
    except Exception as e:
        print(f"⚠️  Binary model not loaded: {e}")
        return False

def is_prawn_egg(image_array, threshold=0.5):
    """Check if image contains prawn egg"""
    global binary_model
    if binary_model is None:
        return True, 1.0
    try:
        prediction = binary_model.predict(image_array, verbose=0)
        confidence = float(prediction[0][0])
        is_prawn = confidence >= threshold
        return is_prawn, confidence
    except Exception as e:
        print(f"Binary model error: {e}")
        return True, 1.0

# ============================================
# ROUTES - Main Pages
# ============================================

@app.route('/')
def index():
    """Main page - shows login or home depending on session"""
    return render_template('main.html')

# ============================================
# API ROUTES - Authentication
# ============================================

@app.route('/api/login', methods=['POST'])
def login():
    """Handle user login"""
    data = request.get_json()
    username = data.get('username') or data.get('email')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'success': False, 'message': 'Username and password required'})
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute('SELECT * FROM users WHERE email = %s', (username,))
        user = cursor.fetchone()
        
        cursor.close()
        conn.close()
        
        if user and check_password_hash(user['password'], password):
            # Set session
            session['user_id'] = user['id']
            session['user_email'] = user['email']
            session['user_name'] = user['name']
            
            return jsonify({
                'success': True,
                'user_id': user['id'],
                'name': user['name'],
                'email': user['email']
            })
        else:
            return jsonify({'success': False, 'message': 'Invalid credentials'})
            
    except Exception as e:
        print(f"Login error: {e}")
        return jsonify({'success': False, 'message': 'Server error'})

@app.route('/api/signup', methods=['POST'])
def signup():
    """Handle user registration"""
    data = request.get_json()
    name = data.get('name')
    username = data.get('username') or data.get('email')
    password = data.get('password')
    
    if not name or not username or not password:
        return jsonify({'success': False, 'message': 'All fields required'})
    
    if len(password) < 6:
        return jsonify({'success': False, 'message': 'Password must be at least 6 characters'})
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # Check if email exists
        cursor.execute('SELECT id FROM users WHERE email = %s', (username,))
        if cursor.fetchone():
            cursor.close()
            conn.close()
            return jsonify({'success': False, 'message': 'Username already registered'})
        
        # Hash password and insert user
        hashed_password = generate_password_hash(password)
        cursor.execute(
            'INSERT INTO users (name, email, password) VALUES (%s, %s, %s)',
            (name, username, hashed_password)
        )
        conn.commit()
        user_id = cursor.lastrowid
        
        cursor.close()
        conn.close()
        
        # Set session
        session['user_id'] = user_id
        session['user_email'] = username
        session['user_name'] = name
        
        return jsonify({
            'success': True,
            'user_id': user_id,
            'name': name,
            'email': username
        })
        
    except Exception as e:
        print(f"Signup error: {e}")
        return jsonify({'success': False, 'message': 'Server error'})

@app.route('/api/logout', methods=['POST'])
def logout():
    """Handle user logout"""
    session.clear()
    return jsonify({'success': True})

# ============================================
# NEW: Session check route (Fix #1 & #2)
# ============================================

@app.route('/api/check_session')
def check_session():
    """Return whether the current server-side session is valid."""
    if 'user_id' in session:
        return jsonify({'valid': True, 'user_id': session['user_id']})
    return jsonify({'valid': False})

@app.route('/api/change_password', methods=['POST'])
@login_required
def change_password():
    """Handle password change"""
    data = request.get_json()
    user_id = session.get('user_id')
    current_password = data.get('current_password')
    new_password = data.get('new_password')
    
    if not current_password or not new_password:
        return jsonify({'success': False, 'message': 'All fields required'})
    
    if len(new_password) < 6:
        return jsonify({'success': False, 'message': 'Password must be at least 6 characters'})
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute('SELECT password FROM users WHERE id = %s', (user_id,))
        user = cursor.fetchone()
        
        if not user or not check_password_hash(user['password'], current_password):
            cursor.close()
            conn.close()
            return jsonify({'success': False, 'message': 'Current password is incorrect'})
        
        # Update password
        hashed_password = generate_password_hash(new_password)
        cursor.execute('UPDATE users SET password = %s WHERE id = %s', (hashed_password, user_id))
        conn.commit()
        
        cursor.close()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Password changed successfully'})
        
    except Exception as e:
        print(f"Change password error: {e}")
        return jsonify({'success': False, 'message': 'Server error'})

# ============================================
# API ROUTES - Prawn Management
# ============================================

@app.route('/api/save_prawn', methods=['POST'])
@login_required
def save_prawn():
    """Save new prawn"""
    data = request.get_json()
    user_id = session.get('user_id')
    name = data.get('name')
    location_id = data.get('location_id')
    
    if not name or not location_id:
        return jsonify({'success': False, 'message': 'All fields required'})
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # Verify location belongs to user
        cursor.execute('SELECT id, name FROM locations WHERE id = %s AND user_id = %s', (location_id, user_id))
        location = cursor.fetchone()
        if not location:
            cursor.close()
            conn.close()
            return jsonify({'success': False, 'message': 'Invalid location'})
        
        cursor.execute(
            'INSERT INTO prawns (user_id, name, location_id) VALUES (%s, %s, %s)',
            (user_id, name, location_id)
        )
        conn.commit()
        prawn_id = cursor.lastrowid
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'success': True,
            'prawn': {
                'id': prawn_id,
                'name': name,
                'location_id': location_id,
                'location_name': location['name']
            }
        })
        
    except Exception as e:
        print(f"Save prawn error: {e}")
        return jsonify({'success': False, 'message': 'Server error'})

@app.route('/api/get_prawns', methods=['GET'])
@login_required
def get_prawns():
    """Get all prawns for current user"""
    user_id = session.get('user_id')
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute(
            '''SELECT p.*, l.name as location_name 
               FROM prawns p 
               LEFT JOIN locations l ON p.location_id = l.id 
               WHERE p.user_id = %s ORDER BY p.created_at DESC''',
            (user_id,)
        )
        prawns = cursor.fetchall()
        
        # Convert datetime objects to strings
        for prawn in prawns:
            if prawn.get('created_at'):
                prawn['created_at'] = prawn['created_at'].isoformat()
        
        cursor.close()
        conn.close()
        
        return jsonify({'success': True, 'prawns': prawns})
        
    except Exception as e:
        print(f"Get prawns error: {e}")
        return jsonify({'success': False, 'message': 'Server error'})

@app.route('/api/delete_prawn', methods=['POST'])
@login_required
def delete_prawn():
    """Delete prawn and its predictions"""
    data = request.get_json()
    user_id = session.get('user_id')
    prawn_id = data.get('prawn_id')
    password = data.get('password')
    
    if not prawn_id or not password:
        return jsonify({'success': False, 'message': 'Prawn ID and password required'})
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # Verify password
        cursor.execute('SELECT password FROM users WHERE id = %s', (user_id,))
        user = cursor.fetchone()
        
        if not user or not check_password_hash(user['password'], password):
            cursor.close()
            conn.close()
            return jsonify({'success': False, 'message': 'Incorrect password'})
        
        # Delete predictions first (foreign key)
        cursor.execute('DELETE FROM predictions WHERE prawn_id = %s', (prawn_id,))
        
        # Delete prawn
        cursor.execute('DELETE FROM prawns WHERE id = %s AND user_id = %s', (prawn_id, user_id))
        conn.commit()
        
        cursor.close()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Prawn deleted successfully'})
        
    except Exception as e:
        print(f"Delete prawn error: {e}")
        return jsonify({'success': False, 'message': 'Server error'})

@app.route('/api/rename_prawn', methods=['POST'])
@login_required
def rename_prawn():
    """Rename a prawn"""
    data = request.get_json()
    user_id = session.get('user_id')
    prawn_id = data.get('prawn_id')
    new_name = data.get('new_name')
    
    if not prawn_id or not new_name or not new_name.strip():
        return jsonify({'success': False, 'message': 'Prawn ID and new name required'})
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE prawns SET name = %s WHERE id = %s AND user_id = %s',
                       (new_name.strip(), prawn_id, user_id))
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({'success': True, 'message': 'Prawn renamed successfully'})
    except Exception as e:
        print(f"Rename prawn error: {e}")
        return jsonify({'success': False, 'message': 'Server error'})

@app.route('/api/transfer_prawn', methods=['POST'])
@login_required
def transfer_prawn():
    """Transfer a prawn to a different location"""
    data = request.get_json()
    user_id = session.get('user_id')
    prawn_id = data.get('prawn_id')
    new_location_id = data.get('new_location_id')
    
    if not prawn_id or not new_location_id:
        return jsonify({'success': False, 'message': 'Prawn ID and location required'})
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        # Verify location belongs to this user
        cursor.execute('SELECT id, name FROM locations WHERE id = %s AND user_id = %s',
                       (new_location_id, user_id))
        location = cursor.fetchone()
        if not location:
            cursor.close()
            conn.close()
            return jsonify({'success': False, 'message': 'Invalid location'})
        cursor.execute('UPDATE prawns SET location_id = %s WHERE id = %s AND user_id = %s',
                       (new_location_id, prawn_id, user_id))
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({'success': True, 'message': 'Location changed successfully', 'new_location': location['name']})
    except Exception as e:
        print(f"Transfer prawn error: {e}")
        return jsonify({'success': False, 'message': 'Server error'})

# ============================================
# API ROUTES - Predictions (ML INTEGRATED)
# ============================================

@app.route('/api/predict', methods=['POST'])
@login_required
def predict():
    """Handle ML prediction with trained model"""
    global model
    
    data = request.get_json()
    image_data = data.get('image')
    
    if not image_data:
        return jsonify({
            'success': False,
            'error': 'No image data provided'
        }), 400
    
    # If model not loaded, return dummy data
    if model is None:
        print("⚠️  Model not loaded, returning dummy prediction")
        return jsonify({
            'success': True,
            'days_until_hatch': 7,
            'confidence': 85.5,
            'current_day': 14,
            'note': 'Using dummy prediction - model not loaded'
        })
    
    try:
        # Decode base64 image
        if image_data.startswith('data:image'):
            image_base64 = image_data.split(',')[1]
        else:
            image_base64 = image_data
        
        image_bytes = base64.b64decode(image_base64)
        image = Image.open(io.BytesIO(image_bytes))
        
        # Preprocess image
        image = image.convert('RGB')
        image = image.resize((224, 224))
        image_array = np.array(image) / 255.0
        image_array = np.expand_dims(image_array, axis=0)
        
        # Brightness check
        avg_brightness = np.mean(image_array)
        if avg_brightness < 0.05:  # Too dark
            return jsonify({
                'success': False,
                'error': 'Image too dark. Cannot detect prawn eggs. Please use better lighting.',
                'no_prawn_detected': True
            }), 400
        
        if avg_brightness > 0.98:  # Too bright/white
            return jsonify({
                'success': False,
                'error': 'Image overexposed. Cannot detect prawn eggs. Please adjust lighting.',
                'no_prawn_detected': True
            }), 400
        
        # Color variance check (eggs have texture)
        color_std = np.std(image_array)
        if color_std < 0.05:  # Too uniform (blank/solid color)
            return jsonify({
                'success': False,
                'error': 'No prawn eggs detected. Image appears blank or uniform.',
                'no_prawn_detected': True
            }), 400
        
        # BINARY CHECK - Is this a prawn egg?
        is_prawn, prawn_confidence = is_prawn_egg(image_array)
        if not is_prawn:
            return jsonify({
                'success': False,
                'error': 'Hindi makilala ang prawn egg sa larawan. Pakisiguro na malinaw ang larawan ng prawn eggs.',
                'no_prawn_detected': True,
                'debug_info': f'Prawn egg confidence: {prawn_confidence*100:.1f}%'
            }), 400
        
        # Make prediction
        prediction = model.predict(image_array, verbose=0)
        predicted_days = float(prediction[0][0])
        
        # Ensure non-negative prediction
        if predicted_days < -1:
            return jsonify({
                'success': False,
                'error': 'Invalid prediction result. Image may not contain prawn eggs.',
                'no_prawn_detected': True,
                'debug_info': f'Predicted: {predicted_days:.2f} days'
            }), 400
        
        # Check if prediction is unrealistic
        if predicted_days > 25:
            return jsonify({
                'success': False,
                'error': 'Prediction outside normal range. Please upload a clear image of prawn eggs.',
                'no_prawn_detected': True,
                'debug_info': f'Predicted: {predicted_days:.2f} days'
            }), 400
        
        # Clamp to valid range
        predicted_days = max(0, min(21, predicted_days))
        
        # Round to nearest integer
        days_until_hatch = int(round(predicted_days))
        
        # Calculate confidence (simple approach)
        confidence = 100 - abs(predicted_days - days_until_hatch) * 20
        confidence = max(60, min(99, confidence))
        
        # Low confidence warning
        if confidence < 65:
            return jsonify({
                'success': False,
                'error': 'Low confidence prediction. Image quality may be poor. Please try again with a clearer image.',
                'no_prawn_detected': True,
                'debug_info': f'Confidence: {confidence:.1f}%'
            }), 400
        
        # Calculate current day (assuming 21-day cycle)
        max_days = 21
        current_day = max(0, max_days - days_until_hatch)
        
        print(f"✅ Prediction: {days_until_hatch} days (raw: {predicted_days:.2f}, confidence: {confidence:.1f}%)")
        
        return jsonify({
            'success': True,
            'days_until_hatch': days_until_hatch,
            'confidence': float(confidence),
            'current_day': current_day,
            'raw_prediction': float(predicted_days)
        })
        
    except Exception as e:
        print(f"❌ Prediction error: {e}")
        import traceback
        traceback.print_exc()
        
        return jsonify({
            'success': False,
            'error': f'Prediction failed: {str(e)}'
        }), 500

@app.route('/api/save_prediction', methods=['POST'])
@login_required
def save_prediction():
    """Save prediction to database"""
    data = request.get_json()
    user_id = session.get('user_id')
    prawn_id = data.get('prawn_id')
    image_data = data.get('image_path')
    predicted_days = data.get('predicted_days')
    current_day = data.get('current_day')
    confidence = data.get('confidence')
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Save image to file
        image_filename = None
        if image_data and image_data.startswith('data:image'):
            # Extract base64 data
            image_base64 = image_data.split(',')[1]
            image_bytes = base64.b64decode(image_base64)
            
            # Generate filename
            ph_tz = pytz.timezone('Asia/Manila')
            ph_now = datetime.now(ph_tz)
            timestamp = ph_now.strftime('%Y%m%d_%H%M%S')
            image_filename = f'prediction_{user_id}_{timestamp}.jpg'
            image_path = os.path.join(app.config['UPLOAD_FOLDER'], image_filename)
            
            # Save file
            os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
            with open(image_path, 'wb') as f:
                f.write(image_bytes)
            
            # Store relative path
            image_filename = f'uploads/{image_filename}'
        
        cursor.execute(
            '''INSERT INTO predictions 
                (user_id, prawn_id, image_path, predicted_days, current_day, confidence, created_at) 
                VALUES (%s, %s, %s, %s, %s, %s, %s)''',
                (user_id, prawn_id, image_filename, predicted_days, current_day, confidence, ph_now.strftime('%Y-%m-%d %H:%M:%S'))
            )
        conn.commit()
        
        cursor.close()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Prediction saved'})
        
    except Exception as e:
        print(f"Save prediction error: {e}")
        return jsonify({'success': False, 'message': 'Server error'})

@app.route('/api/get_predictions', methods=['GET'])
@login_required
def get_predictions():
    """Get predictions for a prawn"""
    user_id = session.get('user_id')
    prawn_id = request.args.get('prawn_id')
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute(
            '''SELECT * FROM predictions 
               WHERE user_id = %s AND prawn_id = %s 
               ORDER BY created_at DESC''',
            (user_id, prawn_id)
        )
        predictions = cursor.fetchall()
        
        # Convert datetime to string
        for pred in predictions:
            if pred.get('created_at'):
                pred['created_at'] = pred['created_at'].isoformat()
        
        cursor.close()
        conn.close()
        
        return jsonify({'success': True, 'predictions': predictions})
        
    except Exception as e:
        print(f"Get predictions error: {e}")
        return jsonify({'success': False, 'message': 'Server error'})

# ============================================
# NEW: Delete single prediction log (Fix #4)
# ============================================

@app.route('/api/delete_prediction', methods=['POST'])
@login_required
def delete_prediction():
    """Delete a single prediction record (and its saved image file)."""
    data = request.get_json()
    user_id = session.get('user_id')
    prediction_id = data.get('prediction_id')

    if not prediction_id:
        return jsonify({'success': False, 'message': 'Prediction ID required'})

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Fetch the record first so we can delete the image file
        cursor.execute(
            'SELECT image_path FROM predictions WHERE id = %s AND user_id = %s',
            (prediction_id, user_id)
        )
        record = cursor.fetchone()

        if not record:
            cursor.close()
            conn.close()
            return jsonify({'success': False, 'message': 'Prediction not found or access denied'})

        # Delete the image file from disk if it exists
        if record.get('image_path'):
            full_path = os.path.join(app.config['UPLOAD_FOLDER'], os.path.basename(record['image_path']))
            if os.path.exists(full_path):
                try:
                    os.remove(full_path)
                except OSError as e:
                    print(f"Warning: could not delete image file {full_path}: {e}")

        # Delete the DB record
        cursor.execute(
            'DELETE FROM predictions WHERE id = %s AND user_id = %s',
            (prediction_id, user_id)
        )
        conn.commit()
        cursor.close()
        conn.close()

        return jsonify({'success': True, 'message': 'Prediction deleted'})

    except Exception as e:
        print(f"Delete prediction error: {e}")
        return jsonify({'success': False, 'message': 'Server error'})

# ============================================
# API ROUTES - Camera Integration
# ============================================

@app.route('/api/camera/status')
@login_required
def camera_status():
    """Check if camera is available"""
    if not CAMERA_ENABLED:
        return jsonify({
            'success': False,
            'message': 'Camera not enabled'
        })
    
    try:
        import requests
        response = requests.get(f'{CAMERA_URL}/status', timeout=3)
        data = response.json()
        return jsonify({
            'success': True,
            'camera_online': True,
            'camera_url': f'{CAMERA_URL}/video_feed',
            **data
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'camera_online': False,
            'error': str(e)
        })

@app.route('/api/camera/capture')
@login_required
def camera_capture():
    if not CAMERA_ENABLED:
        return jsonify({'success': False, 'message': 'Camera not enabled'})
    
    try:
        import requests
        response = requests.get(f'{CAMERA_URL}/capture', timeout=5)
        data = response.json()
        if data.get('success'):
            return jsonify({'success': True, 'image': data['image']})
        else:
            return jsonify({'success': False, 'error': data.get('error', 'Capture failed')})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/camera/stream')
@login_required
def camera_stream():
    """Proxy camera stream"""
    if not CAMERA_ENABLED:
        return jsonify({'error': 'Camera not enabled'}), 400
    
    try:
        import requests
        
        req = requests.get(f'{CAMERA_URL}/video_feed', stream=True, timeout=5)
        
        return Response(
            req.iter_content(chunk_size=1024),
            content_type=req.headers['Content-Type']
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============================================
# API ROUTES - Location Management
# ============================================

@app.route('/api/get_locations', methods=['GET'])
@login_required
def get_locations():
    """Get all locations for current user"""
    user_id = session.get('user_id')
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute('SELECT * FROM locations WHERE user_id = %s ORDER BY name ASC', (user_id,))
        locations = cursor.fetchall()
        for loc in locations:
            if loc.get('created_at'):
                loc['created_at'] = loc['created_at'].isoformat()
        cursor.close()
        conn.close()
        return jsonify({'success': True, 'locations': locations})
    except Exception as e:
        print(f"Get locations error: {e}")
        return jsonify({'success': False, 'message': 'Server error'})

@app.route('/api/save_location', methods=['POST'])
@login_required
def save_location():
    """Save new location"""
    data = request.get_json()
    user_id = session.get('user_id')
    name = data.get('name')
    if not name or not name.strip():
        return jsonify({'success': False, 'message': 'Location name required'})
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute('SELECT id FROM locations WHERE user_id = %s AND name = %s', (user_id, name.strip()))
        if cursor.fetchone():
            cursor.close()
            conn.close()
            return jsonify({'success': False, 'message': 'Location already exists'})
        cursor.execute('INSERT INTO locations (user_id, name) VALUES (%s, %s)', (user_id, name.strip()))
        conn.commit()
        location_id = cursor.lastrowid
        cursor.close()
        conn.close()
        return jsonify({'success': True, 'location': {'id': location_id, 'name': name.strip()}})
    except Exception as e:
        print(f"Save location error: {e}")
        return jsonify({'success': False, 'message': 'Server error'})

@app.route('/api/rename_location', methods=['POST'])
@login_required
def rename_location():
    """Rename existing location"""
    data = request.get_json()
    user_id = session.get('user_id')
    location_id = data.get('location_id')
    new_name = data.get('new_name')
    if not location_id or not new_name or not new_name.strip():
        return jsonify({'success': False, 'message': 'Location ID and new name required'})
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute('SELECT id FROM locations WHERE user_id = %s AND name = %s AND id != %s', (user_id, new_name.strip(), location_id))
        if cursor.fetchone():
            cursor.close()
            conn.close()
            return jsonify({'success': False, 'message': 'Location name already exists'})
        cursor.execute('UPDATE locations SET name = %s WHERE id = %s AND user_id = %s', (new_name.strip(), location_id, user_id))
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({'success': True, 'message': 'Location renamed successfully'})
    except Exception as e:
        print(f"Rename location error: {e}")
        return jsonify({'success': False, 'message': 'Server error'})

@app.route('/api/delete_location', methods=['POST'])
@login_required
def delete_location():
    """Delete location"""
    data = request.get_json()
    user_id = session.get('user_id')
    location_id = data.get('location_id')
    if not location_id:
        return jsonify({'success': False, 'message': 'Location ID required'})
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM locations WHERE id = %s AND user_id = %s', (location_id, user_id))
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({'success': True, 'message': 'Location deleted successfully'})
    except Exception as e:
        print(f"Delete location error: {e}")
        return jsonify({'success': False, 'message': 'Server error'})

# ============================================
# Error Handlers
# ============================================

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({'error': 'Server error'}), 500

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

print("="*60)
print("🦐 HATCHLY - Prawn Egg Hatch Prediction System")
print("="*60)
load_ml_model()
load_binary_model()
print("="*60)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)