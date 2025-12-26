#!/usr/bin/env python3
"""
RFID-controlled EV Charging Kiosk Backend Service
Handles MFRC522 RFID reader, GPIO relay control, and user management
"""

import json
import os
import sys
import time
import threading
import queue
from pathlib import Path
from typing import Optional, Dict, Any
from flask import Flask, jsonify, request, Response, stream_with_context
from flask_cors import CORS

# Try to import hardware libraries (will fail gracefully if not on Raspberry Pi)
try:
    import RPi.GPIO as GPIO
    from mfrc522 import SimpleMFRC522
    HARDWARE_AVAILABLE = True
except ImportError:
    HARDWARE_AVAILABLE = False
    print("[WARNING] Hardware libraries not available. Running in mock mode.")
    # Mock classes for development
    class SimpleMFRC522:
        def read(self):
            # Simulate waiting for card (blocking like real reader)
            time.sleep(1)
            # Return actual card ID for testing: 632589166397 (Lalit's card)
            return (632589166397, "Lalit")
    
    class GPIO:
        OUT = 1
        LOW = 0
        HIGH = 1
        BCM = 11
        @staticmethod
        def setmode(mode):
            pass
        @staticmethod
        def setup(pin, mode):
            pass
        @staticmethod
        def output(pin, state):
            pass
        @staticmethod
        def cleanup():
            pass

# Configuration
RELAY_PIN = 18  # GPIO pin for relay control (BCM numbering)
RFID_READER = None
DATA_FILE = Path(__file__).parent / "users_data.json"
CHARGING_RATE_PER_SECOND = 0.01  # Balance deduction per second while charging (₹0.01/sec = ₹36/hour)

# Flask app setup
app = Flask(__name__)
app.config['JSONIFY_PRETTY_PRINT_REGULAR'] = True
CORS(app)  # Enable CORS for frontend

# Global state
charging_state = {
    "is_charging": False,
    "current_user": None,
    "start_time": None,
    "start_balance": None,
}

# Real-time RFID event queue for SSE
rfid_event_queue = queue.Queue(maxsize=10)
rfid_reading_active = False
last_rfid_read = None
last_rfid_read_time = 0
RFID_DEBOUNCE_SECONDS = 3  # Ignore same card for 3 seconds

# Default users (Lait, Nishad, Fateen)
DEFAULT_USERS = [
    {
        "id": "1",
        "name": "Lalit Nikumbh",
        "rfidCardId": "632589166397",
        "balance": 100.0,
        "phoneNumber": "+91 9876543212",
        "createdAt": "2024-01-01T00:00:00.000Z"
    },
    {
        "id": "2",
        "name": "Fateen Shaikh",
        "rfidCardId": "RFID002",
        "balance": 150.0,
        "phoneNumber": "+91 9876543213",
        "createdAt": "2024-01-01T00:00:00.000Z"
    },
    {
        "id": "3",
        "name": "Nishad Deshmukh",
        "rfidCardId": "RFID003",
        "balance": 90.0,
        "phoneNumber": "+91 9876543214",
        "createdAt": "2024-01-01T00:00:00.000Z"
    }
]


def load_users() -> list:
    """Load users from JSON file, create default if not exists"""
    if DATA_FILE.exists():
        try:
            with open(DATA_FILE, 'r') as f:
                users = json.load(f)
                # Ensure we have all 3 required users
                required_names = ["Lalit Nikumbh", "Fateen Shaikh", "Nishad Deshmukh"]
                existing_names = [u["name"] for u in users]
                missing = [u for u in DEFAULT_USERS if u["name"] not in existing_names]
                if missing:
                    users.extend(missing)
                    save_users(users)
                return users
        except Exception as e:
            print(f"[ERROR] Failed to load users: {e}")
            return DEFAULT_USERS.copy()
    else:
        save_users(DEFAULT_USERS)
        return DEFAULT_USERS.copy()


def save_users(users: list):
    """Save users to JSON file"""
    try:
        with open(DATA_FILE, 'w') as f:
            json.dump(users, f, indent=2)
    except Exception as e:
        print(f"[ERROR] Failed to save users: {e}")


def get_user_by_rfid(rfid_id: str) -> Optional[Dict[str, Any]]:
    """Find user by RFID card ID or by name (partial match)"""
    users = load_users()
    rfid_str = str(rfid_id).strip()
    
    # First, try exact RFID match
    for user in users:
        if str(user.get("rfidCardId", "")).strip() == rfid_str:
            return user
    
    # If no exact match, try to find by name (for cards that might have name stored)
    # This allows matching "Lalit" to "Lalit Nikumbh"
    rfid_lower = rfid_str.lower()
    for user in users:
        user_name = user.get("name", "").lower()
        # Check if RFID string matches any part of the name
        if rfid_lower in user_name or user_name.split()[0].lower() == rfid_lower:
            print(f"[INFO] Matched RFID '{rfid_str}' to user '{user['name']}' by name")
            return user
    
    return None


def update_user_balance(user_id: str, new_balance: float):
    """Update user balance"""
    users = load_users()
    for user in users:
        if user["id"] == user_id:
            user["balance"] = max(0.0, new_balance)  # Ensure balance doesn't go negative
            save_users(users)
            return True
    return False


def init_hardware():
    """Initialize GPIO and RFID reader"""
    global RFID_READER
    
    if not HARDWARE_AVAILABLE:
        print("[INFO] Running in mock mode - hardware not available")
        RFID_READER = SimpleMFRC522()
        return
    
    try:
        # Initialize GPIO
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(RELAY_PIN, GPIO.OUT)
        GPIO.output(RELAY_PIN, GPIO.LOW)  # Start with relay OFF
        
        # Initialize RFID reader
        RFID_READER = SimpleMFRC522()
        print(f"[INFO] Hardware initialized - Relay on GPIO {RELAY_PIN}, RFID reader ready")
    except Exception as e:
        print(f"[ERROR] Hardware initialization failed: {e}")
        RFID_READER = SimpleMFRC522()  # Fallback to mock


def set_relay(state: bool):
    """Control relay (True = ON, False = OFF)"""
    if not HARDWARE_AVAILABLE:
        print(f"[MOCK] Relay {'ON' if state else 'OFF'}")
        return
    
    try:
        GPIO.output(RELAY_PIN, GPIO.HIGH if state else GPIO.LOW)
        print(f"[INFO] Relay {'ON' if state else 'OFF'}")
    except Exception as e:
        print(f"[ERROR] Failed to control relay: {e}")


def start_charging(user: Dict[str, Any]) -> bool:
    """Start charging for a user"""
    if charging_state["is_charging"]:
        print("[WARN] Charging already in progress")
        return False
    
    if user["balance"] <= 0:
        print(f"[WARN] Insufficient balance for {user['name']}")
        return False
    
    charging_state["is_charging"] = True
    charging_state["current_user"] = user
    charging_state["start_time"] = time.time()
    charging_state["start_balance"] = user["balance"]
    
    set_relay(True)  # Turn ON relay
    print(f"[INFO] Charging started for {user['name']} (Balance: ₹{user['balance']:.2f})")
    return True


def stop_charging():
    """Stop charging"""
    if not charging_state["is_charging"]:
        return False
    
    user = charging_state["current_user"]
    if user:
        # Calculate balance deduction
        elapsed = time.time() - charging_state["start_time"]
        deduction = elapsed * CHARGING_RATE_PER_SECOND
        new_balance = max(0.0, charging_state["start_balance"] - deduction)
        
        update_user_balance(user["id"], new_balance)
        print(f"[INFO] Charging stopped for {user['name']} (Deducted: ₹{deduction:.2f}, Remaining: ₹{new_balance:.2f})")
    
    set_relay(False)  # Turn OFF relay
    
    charging_state["is_charging"] = False
    charging_state["current_user"] = None
    charging_state["start_time"] = None
    charging_state["start_balance"] = None
    
    return True


def calculate_current_balance() -> float:
    """Calculate current balance based on charging time"""
    if not charging_state["is_charging"] or not charging_state["current_user"]:
        return 0.0
    
    elapsed = time.time() - charging_state["start_time"]
    deduction = elapsed * CHARGING_RATE_PER_SECOND
    return max(0.0, charging_state["start_balance"] - deduction)


def charging_monitor():
    """Background thread to monitor charging and update balance"""
    while True:
        if charging_state["is_charging"] and charging_state["current_user"]:
            current_balance = calculate_current_balance()
            
            # Auto-stop if balance reaches zero
            if current_balance <= 0:
                print("[INFO] Balance depleted - stopping charging")
                stop_charging()
            else:
                # Update balance in real-time
                user_id = charging_state["current_user"]["id"]
                update_user_balance(user_id, current_balance)
        
        time.sleep(1)  # Update every second


def continuous_rfid_reader():
    """Background thread to read RFID cards when they come near (event-driven)"""
    global last_rfid_read, last_rfid_read_time, rfid_reading_active
    
    if not RFID_READER:
        print("[WARNING] RFID reader not initialized")
        return
    
    print("[INFO] RFID reader ready - waiting for cards...")
    
    while rfid_reading_active:
        try:
            # read() blocks until a card is detected - this is event-driven
            card_id, text = RFID_READER.read()
            rfid_id = str(card_id).strip()
            current_time = time.time()
            
            # Debounce: ignore same card if detected within debounce period
            if rfid_id == last_rfid_read and (current_time - last_rfid_read_time) < RFID_DEBOUNCE_SECONDS:
                continue
            
            # New card detected
            last_rfid_read = rfid_id
            last_rfid_read_time = current_time
            print(f"[INFO] RFID card detected: {rfid_id}")
            
            # Find user (by RFID ID or name)
            user = get_user_by_rfid(rfid_id)
            
            # Create and send event
            event_data = {
                "type": "rfid_detected",
                "rfidCardId": rfid_id,
                "timestamp": current_time,
                "user": user,
                "success": user is not None,
                "error": None if user else "Card not registered"
            }
            
            try:
                rfid_event_queue.put(event_data, timeout=0.1)
            except queue.Full:
                pass
            
            # Handle charging logic
            if user:
                if charging_state["is_charging"]:
                    # If same user, stop charging
                    if charging_state["current_user"] and charging_state["current_user"]["id"] == user["id"]:
                        stop_charging()
                        try:
                            rfid_event_queue.put({
                                "type": "charging_stopped",
                                "user": user,
                                "timestamp": current_time
                            }, timeout=0.1)
                        except queue.Full:
                            pass
                else:
                    # Start charging if balance available
                    if user["balance"] > 0:
                        if start_charging(user):
                            try:
                                rfid_event_queue.put({
                                    "type": "charging_started",
                                    "user": user,
                                    "timestamp": current_time
                                }, timeout=0.1)
                            except queue.Full:
                                pass
                    else:
                        try:
                            rfid_event_queue.put({
                                "type": "insufficient_balance",
                                "user": user,
                                "timestamp": current_time
                            }, timeout=0.1)
                        except queue.Full:
                            pass
            
        except Exception as e:
            # Handle errors (card removed, read timeout, etc.)
            error_msg = str(e).lower()
            if "timeout" not in error_msg and "no card" not in error_msg:
                print(f"[ERROR] RFID read error: {e}")


# API Endpoints

@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "ok",
        "hardware_available": HARDWARE_AVAILABLE,
        "charging": charging_state["is_charging"]
    })


@app.route('/api/rfid/stream', methods=['GET'])
def rfid_stream():
    """Server-Sent Events endpoint for real-time RFID updates"""
    def event_stream():
        """Generator function for SSE"""
        while True:
            try:
                # Wait for event with timeout to allow connection checks
                event = rfid_event_queue.get(timeout=30)
                data = json.dumps(event)
                yield f"data: {data}\n\n"
            except queue.Empty:
                # Send keepalive ping
                yield ": keepalive\n\n"
            except Exception as e:
                print(f"[ERROR] SSE error: {e}")
                break
    
    return Response(
        stream_with_context(event_stream()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive'
        }
    )


@app.route('/api/rfid/scan', methods=['POST'])
def scan_rfid():
    """Scan RFID card"""
    try:
        if not RFID_READER:
            return jsonify({"error": "RFID reader not initialized"}), 500
        
        # Read RFID card
        print("[INFO] Waiting for RFID card...")
        card_id, text = RFID_READER.read()
        rfid_id = str(card_id).strip()
        
        print(f"[INFO] RFID card scanned: {rfid_id}")
        
        # Find user
        user = get_user_by_rfid(rfid_id)
        if not user:
            return jsonify({
                "success": False,
                "error": "Unauthorized card",
                "rfidCardId": rfid_id
            }), 401
        
        # If already charging with same card, stop charging
        if charging_state["is_charging"] and charging_state["current_user"]:
            if charging_state["current_user"]["id"] == user["id"]:
                stop_charging()
                return jsonify({
                    "success": True,
                    "action": "stopped",
                    "user": user,
                    "message": "Charging stopped"
                })
        
        # Check if charging is in progress with different user
        if charging_state["is_charging"]:
            return jsonify({
                "success": False,
                "error": "Charging already in progress",
                "currentUser": charging_state["current_user"]["name"]
            }), 409
        
        # Check balance
        if user["balance"] <= 0:
            return jsonify({
                "success": False,
                "error": "Insufficient balance",
                "user": user
            }), 402
        
        # Start charging
        if start_charging(user):
            # Reload user to get updated balance
            updated_user = get_user_by_rfid(rfid_id)
            return jsonify({
                "success": True,
                "action": "started",
                "user": updated_user,
                "message": "Charging started"
            })
        else:
            return jsonify({
                "success": False,
                "error": "Failed to start charging"
            }), 500
            
    except Exception as e:
        print(f"[ERROR] RFID scan failed: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/users', methods=['GET'])
def get_users():
    """Get all users"""
    users = load_users()
    return jsonify(users)


@app.route('/api/users/<user_id>', methods=['GET'])
def get_user(user_id: str):
    """Get user by ID"""
    users = load_users()
    user = next((u for u in users if u["id"] == user_id), None)
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(user)


@app.route('/api/users/rfid/<rfid_id>', methods=['GET'])
def get_user_by_rfid_endpoint(rfid_id: str):
    """Get user by RFID card ID"""
    user = get_user_by_rfid(rfid_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(user)


@app.route('/api/users/<user_id>/balance', methods=['PUT'])
def update_balance(user_id: str):
    """Update user balance"""
    data = request.get_json()
    new_balance = data.get("balance")
    
    if new_balance is None:
        return jsonify({"error": "Balance is required"}), 400
    
    if update_user_balance(user_id, float(new_balance)):
        user = get_user_by_rfid(load_users()[int(user_id) - 1]["rfidCardId"])
        return jsonify(user)
    else:
        return jsonify({"error": "User not found"}), 404


@app.route('/api/charging/status', methods=['GET'])
def charging_status():
    """Get current charging status"""
    status = {
        "isCharging": charging_state["is_charging"],
        "currentUser": None,
        "currentBalance": 0.0,
        "startTime": None
    }
    
    if charging_state["is_charging"] and charging_state["current_user"]:
        status["currentUser"] = charging_state["current_user"]
        status["currentBalance"] = calculate_current_balance()
        status["startTime"] = charging_state["start_time"]
    
    return jsonify(status)


@app.route('/api/charging/stop', methods=['POST'])
def stop_charging_endpoint():
    """Manually stop charging"""
    if not charging_state["is_charging"]:
        return jsonify({"error": "No charging in progress"}), 400
    
    stop_charging()
    return jsonify({"success": True, "message": "Charging stopped"})


@app.route('/api/charging/start', methods=['POST'])
def start_charging_endpoint():
    """Manually start charging (requires user_id in request)"""
    data = request.get_json()
    user_id = data.get("userId")
    
    if not user_id:
        return jsonify({"error": "userId is required"}), 400
    
    users = load_users()
    user = next((u for u in users if u["id"] == str(user_id)), None)
    
    if not user:
        return jsonify({"error": "User not found"}), 404
    
    if start_charging(user):
        return jsonify({"success": True, "user": user})
    else:
        return jsonify({"error": "Failed to start charging"}), 500


def cleanup():
    """Cleanup GPIO on exit"""
    if HARDWARE_AVAILABLE:
        try:
            set_relay(False)
            GPIO.cleanup()
        except:
            pass


if __name__ == '__main__':
    # Initialize hardware
    init_hardware()
    
    # Start charging monitor thread
    monitor_thread = threading.Thread(target=charging_monitor, daemon=True)
    monitor_thread.start()
    
    # Start continuous RFID reading thread
    rfid_reading_active = True
    rfid_thread = threading.Thread(target=continuous_rfid_reader, daemon=True)
    rfid_thread.start()
    print("[INFO] Continuous RFID reading started")
    
    # Register cleanup
    import atexit
    def shutdown():
        global rfid_reading_active
        rfid_reading_active = False
        cleanup()
    atexit.register(shutdown)
    
    # Run Flask app
    port = int(os.environ.get('PORT', 5000))
    print(f"[INFO] Starting RFID Service on port {port}")
    print(f"[INFO] API available at http://localhost:{port}/api")
    print(f"[INFO] Real-time RFID stream: http://localhost:{port}/api/rfid/stream")
    
    try:
        app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
    except KeyboardInterrupt:
        print("\n[INFO] Shutting down...")
        rfid_reading_active = False
        cleanup()
        sys.exit(0)

