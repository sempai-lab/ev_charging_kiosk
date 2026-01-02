#!/usr/bin/env python3
"""
RFID-controlled EV Charging Kiosk Backend Service
Handles MFRC522 RFID reader, GPIO relay control, and user management via Google Sheets
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
    from mfrc522 import SimpleMFRC522  # pyright: ignore[reportMissingImports]
    HARDWARE_AVAILABLE = True
except ImportError:
    HARDWARE_AVAILABLE = False
    print("[WARNING] Hardware libraries not available. Running in mock mode.")
    # Mock classes for development
    class SimpleMFRC522:
        def read(self):
            # Simulate waiting for card (blocking like real reader)
            # In mock mode, simulate no card present by raising timeout exception
            # This prevents continuous false detections
            time.sleep(1)
            raise TimeoutError("No card detected")
    
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

# Try to import Google Sheets API
try:
    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build
    GOOGLE_SHEETS_AVAILABLE = True
except ImportError:
    GOOGLE_SHEETS_AVAILABLE = False
    print("[WARNING] Google Sheets API not available. Install: pip install google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client")

# ============================================================
# 📝 GOOGLE SHEETS CONFIGURATION
# ============================================================
SERVICE_ACCOUNT_FILE = os.environ.get('GOOGLE_CREDENTIALS_FILE', 'credentials.json')
SPREADSHEET_ID = os.environ.get('GOOGLE_SHEET_ID', '1etezPbLCeZaYXaJtQlwRjCz0lnizOq2xVYppEi1eag8')
SHEET_NAME = os.environ.get('GOOGLE_SHEET_NAME', 'Sheet2')
RANGE_START_ROW = 2  # Data starts from row 2 (row 1 is header)

# Column mapping
COL_EID = 0          # Column A = RFID Card ID (EID)
COL_NAME = 1        # Column B = Name
COL_CONTACT = 2     # Column C = Contact Number
COL_BALANCE = 3     # Column D = Current Balance

# Polling interval for Google Sheets (seconds)
SHEETS_POLL_INTERVAL = 5  # Check Google Sheets every 5 seconds
last_sheets_poll = 0

# Configuration
RELAY_PIN = 18  # GPIO pin for relay control (BCM numbering)
RFID_READER = None
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
RFID_DEBOUNCE_SECONDS = 5  # Ignore same card for 5 seconds

# User cache with automatic expiration
user_cache = {
    "data": None,
    "timestamp": 0,
    "lock": threading.Lock()
}
CACHE_EXPIRY_SECONDS = 30  # Cache expires after 30 seconds

# Google Sheets service
sheets_service = None

# ============================================================
# GOOGLE SHEETS FUNCTIONS
# ============================================================

def init_google_sheets():
    """Initialize Google Sheets API"""
    global sheets_service
    
    if not GOOGLE_SHEETS_AVAILABLE:
        print("[WARNING] Google Sheets API not available. Using fallback mode.")
        return False
    
    try:
        SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
        creds_path = Path(__file__).parent / SERVICE_ACCOUNT_FILE
        
        if not creds_path.exists():
            print(f"[WARNING] Google credentials file not found: {creds_path}")
            print("[INFO] Continuing without Google Sheets. Users will be stored locally.")
            return False
        
        creds = Credentials.from_service_account_file(str(creds_path), scopes=SCOPES)
        sheets_service = build('sheets', 'v4', credentials=creds)
        
        print(f"[INFO] ✓ Google Sheets API connected successfully!")
        print(f"[INFO] Sheet ID: {SPREADSHEET_ID}")
        print(f"[INFO] Sheet Name: {SHEET_NAME}")
        return True
        
    except Exception as e:
        print(f"[ERROR] Failed to connect to Google Sheets: {e}")
        print("[INFO] Continuing without Google Sheets. Users will be stored locally.")
        return False


def fetch_users_from_sheets() -> list:
    """Fetch users from Google Sheets (READ from Sheet)"""
    global last_sheets_poll
    
    if not sheets_service:
        return []
    
    current_time = time.time()
    
    # Check if we need to poll (respect polling interval)
    if current_time - last_sheets_poll < SHEETS_POLL_INTERVAL:
        return []  # Return empty to use cache
    
    last_sheets_poll = current_time
    
    try:
        range_name = f"{SHEET_NAME}!A{RANGE_START_ROW}:D"
        result = sheets_service.spreadsheets().values().get(
            spreadsheetId=SPREADSHEET_ID,
            range=range_name
        ).execute()
        
        values = result.get('values', [])
        users = []
        
        for idx, row in enumerate(values, start=RANGE_START_ROW):
            if len(row) >= 2:  # At least EID and Name must be present
                try:
                    balance = float(row[COL_BALANCE].strip()) if len(row) > COL_BALANCE and row[COL_BALANCE].strip() else 0.0
                except (ValueError, IndexError):
                    balance = 0.0
                
                user = {
                    "id": str(idx - RANGE_START_ROW + 1),  # Generate ID based on row
                    "name": str(row[COL_NAME]).strip() if len(row) > COL_NAME else "",
                    "rfidCardId": str(row[COL_EID]).strip() if len(row) > COL_EID else "",
                    "balance": balance,
                    "phoneNumber": str(row[COL_CONTACT]).strip() if len(row) > COL_CONTACT else "",
                    "createdAt": "2024-01-01T00:00:00.000Z"  # Default timestamp
                }
                users.append(user)
        
        print(f"[SHEETS] ✓ Fetched {len(users)} users from Google Sheets")
        return users
        
    except Exception as e:
        print(f"[SHEETS] Error fetching users: {e}")
        return []


def write_user_to_sheets(card_id: str, card_text: str) -> bool:
    """Write new user to Google Sheets (WRITE from Hardware to Sheet)"""
    if not sheets_service:
        return False
    
    try:
        # First, fetch current users to find next row
        range_name = f"{SHEET_NAME}!A{RANGE_START_ROW}:D"
        result = sheets_service.spreadsheets().values().get(
            spreadsheetId=SPREADSHEET_ID,
            range=range_name
        ).execute()
        
        values = result.get('values', [])
        next_row = len(values) + RANGE_START_ROW
        
        # Prepare new user data
        new_user_data = [
            str(card_id),           # EID (Column A)
            str(card_text).strip(), # Name (Column B)
            "",                     # Contact Number (Column C) - empty for now
            "0"                     # Current Balance (Column D) - default to 0
        ]
        
        range_name = f"{SHEET_NAME}!A{next_row}:D{next_row}"
        
        body = {'values': [new_user_data]}
        
        result = sheets_service.spreadsheets().values().update(
            spreadsheetId=SPREADSHEET_ID,
            range=range_name,
            valueInputOption='RAW',
            body=body
        ).execute()
        
        print(f"[SHEETS] ✓ Added new user to row {next_row}")
        clear_user_cache()  # Clear cache to force refresh
        return True
        
    except Exception as e:
        print(f"[SHEETS] Error writing user: {e}")
        return False


def update_balance_in_sheets(card_id: str, new_balance: float) -> bool:
    """Update user balance in Google Sheets"""
    if not sheets_service:
        return False
    
    try:
        # Fetch users to find the row
        range_name = f"{SHEET_NAME}!A{RANGE_START_ROW}:D"
        result = sheets_service.spreadsheets().values().get(
            spreadsheetId=SPREADSHEET_ID,
            range=range_name
        ).execute()
        
        values = result.get('values', [])
        
        # Find the user by card_id
        for idx, row in enumerate(values, start=RANGE_START_ROW):
            if len(row) > COL_EID and str(row[COL_EID]).strip() == str(card_id).strip():
                # Found the user, update balance
                balance_range = f"{SHEET_NAME}!D{idx}"
                
                body = {'values': [[str(new_balance)]]}
                
                result = sheets_service.spreadsheets().values().update(
                    spreadsheetId=SPREADSHEET_ID,
                    range=balance_range,
                    valueInputOption='RAW',
                    body=body
                ).execute()
                
                print(f"[SHEETS] ✓ Updated balance for card {card_id} to ₹{new_balance:.2f}")
                clear_user_cache()  # Clear cache to force refresh
                return True
        
        print(f"[SHEETS] User with card ID {card_id} not found in sheet")
        return False
        
    except Exception as e:
        print(f"[SHEETS] Error updating balance: {e}")
        return False


# ============================================================
# USER MANAGEMENT FUNCTIONS
# ============================================================

def load_users(use_cache: bool = True) -> list:
    """Load users from Google Sheets or fallback to local storage. Uses cache if available."""
    current_time = time.time()
    
    # Check cache first
    if use_cache:
        with user_cache["lock"]:
            if (user_cache["data"] is not None and 
                (current_time - user_cache["timestamp"]) < CACHE_EXPIRY_SECONDS):
                return user_cache["data"].copy()
    
    # Try to load from Google Sheets first
    if sheets_service:
        users = fetch_users_from_sheets()
        if users:
            # Update cache
            if use_cache:
                with user_cache["lock"]:
                    user_cache["data"] = users.copy()
                    user_cache["timestamp"] = current_time
            return users
    
    # Fallback: return empty list or default users
    # In production, you might want to keep a local backup
    return []


def save_users(users: list):
    """Save users - updates Google Sheets if available"""
    if sheets_service:
        # For bulk updates, we'd need to update each user individually
        # For now, we'll update balances as they change
        print("[INFO] Users are managed via Google Sheets. Individual updates will sync automatically.")
    else:
        print("[WARNING] Google Sheets not available. Users not persisted.")
    
    # Clear cache when data is saved
    clear_user_cache()


def get_user_by_rfid(rfid_id: str) -> Optional[Dict[str, Any]]:
    """Find user by RFID card ID (exact match only for security)"""
    users = load_users()
    rfid_str = str(rfid_id).strip()
    
    # Only match by exact RFID card ID for security
    for user in users:
        if str(user.get("rfidCardId", "")).strip() == rfid_str:
            return user.copy()  # Return a copy to avoid modifying cached data
    
    return None


def update_user_balance(user_id: str, new_balance: float):
    """Update user balance - syncs with Google Sheets"""
    users = load_users(use_cache=False)  # Don't use cache when updating
    for user in users:
        if user["id"] == user_id:
            old_balance = user["balance"]
            user["balance"] = max(0.0, new_balance)  # Ensure balance doesn't go negative
            
            # Update in Google Sheets if available
            if sheets_service:
                update_balance_in_sheets(user["rfidCardId"], new_balance)
            
            # Update local cache
            with user_cache["lock"]:
                if user_cache["data"]:
                    for cached_user in user_cache["data"]:
                        if cached_user["id"] == user_id:
                            cached_user["balance"] = new_balance
                            break
            
            print(f"[INFO] Balance updated: {user['name']} - ₹{old_balance:.2f} → ₹{new_balance:.2f}")
            return True
    return False


def clear_user_cache():
    """Clear the user cache"""
    with user_cache["lock"]:
        user_cache["data"] = None
        user_cache["timestamp"] = 0
        print("[INFO] User cache cleared")


def get_cache_info() -> Dict[str, Any]:
    """Get cache information"""
    with user_cache["lock"]:
        current_time = time.time()
        age = current_time - user_cache["timestamp"] if user_cache["timestamp"] > 0 else 0
        is_valid = (user_cache["data"] is not None and 
                   age < CACHE_EXPIRY_SECONDS)
        
        return {
            "cached": user_cache["data"] is not None,
            "age_seconds": round(age, 2),
            "expiry_seconds": CACHE_EXPIRY_SECONDS,
            "is_valid": is_valid,
            "cache_size": len(user_cache["data"]) if user_cache["data"] else 0,
            "google_sheets_enabled": sheets_service is not None
        }


# ============================================================
# HARDWARE FUNCTIONS
# ============================================================

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
                # Update balance in real-time (local cache only, sheets updated on stop)
                user_id = charging_state["current_user"]["id"]
                # Update local cache only during charging
                with user_cache["lock"]:
                    if user_cache["data"]:
                        for cached_user in user_cache["data"]:
                            if cached_user["id"] == user_id:
                                cached_user["balance"] = current_balance
                                break
        
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
            print(f"[INFO] RFID card detected: {rfid_id} (Text: {text if text else 'N/A'})")
            
            # Find user (by RFID ID only - exact match required for security)
            user = get_user_by_rfid(rfid_id)
            
            # If user not found and Google Sheets is available, try to add as new user
            if not user and sheets_service:
                print(f"[INFO] New card detected. Adding to Google Sheets...")
                if write_user_to_sheets(rfid_id, text if text else f"User_{rfid_id}"):
                    # Reload users and find the newly added user
                    clear_user_cache()
                    user = get_user_by_rfid(rfid_id)
                    if user:
                        print(f"[INFO] New user added: {user['name']}")
            
            # Reload user to get latest balance if user found
            if user:
                users = load_users()
                updated_user = next((u for u in users if u["id"] == user["id"]), user)
                user = updated_user
                print(f"[INFO] User found: {user['name']} - Balance: ₹{user['balance']:.2f}")
            else:
                print(f"[WARNING] RFID card {rfid_id} not registered")
            
            # Create and send event with user data
            event_data = {
                "type": "rfid_detected",
                "rfidCardId": rfid_id,
                "timestamp": current_time,
                "user": user,
                "success": user is not None,
                "error": None if user else f"Card {rfid_id} not registered. Please contact admin."
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


# ============================================================
# API ENDPOINTS
# ============================================================

@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "ok",
        "hardware_available": HARDWARE_AVAILABLE,
        "google_sheets_enabled": sheets_service is not None,
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
        
        # If user not found and Google Sheets available, add as new user
        if not user and sheets_service:
            print(f"[INFO] New card detected. Adding to Google Sheets...")
            if write_user_to_sheets(rfid_id, text if text else f"User_{rfid_id}"):
                clear_user_cache()
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
        # Reload users and find the user by ID (safer than array indexing)
        users = load_users(use_cache=False)
        user = next((u for u in users if u["id"] == user_id), None)
        if user:
            return jsonify(user)
        else:
            return jsonify({"error": "User not found after update"}), 404
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


@app.route('/api/cache/clear', methods=['POST'])
def clear_cache_endpoint():
    """Manually clear the user cache"""
    clear_user_cache()
    return jsonify({
        "success": True,
        "message": "Cache cleared successfully"
    })


@app.route('/api/cache/info', methods=['GET'])
def cache_info_endpoint():
    """Get cache information"""
    return jsonify(get_cache_info())


@app.route('/api/rfid/registered', methods=['GET'])
def get_registered_rfid_cards():
    """Get list of registered RFID cards"""
    users = load_users()
    registered_cards = [
        {
            "rfidCardId": user["rfidCardId"],
            "name": user["name"],
            "balance": user["balance"]
        }
        for user in users
    ]
    return jsonify({
        "registeredCards": registered_cards,
        "total": len(registered_cards)
    })


def cache_monitor():
    """Background thread to monitor and auto-clear cache when threshold is reached"""
    while True:
        try:
            cache_info = get_cache_info()
            
            # Auto-clear if cache is expired
            if cache_info["cached"] and not cache_info["is_valid"]:
                print(f"[INFO] Auto-clearing expired cache (age: {cache_info['age_seconds']:.2f}s)")
                clear_user_cache()
            
            time.sleep(10)  # Check every 10 seconds
        except Exception as e:
            print(f"[ERROR] Cache monitor error: {e}")
            time.sleep(10)


def cleanup():
    """Cleanup GPIO on exit"""
    if HARDWARE_AVAILABLE:
        try:
            set_relay(False)
            GPIO.cleanup()
        except Exception as e:
            print(f"[WARNING] Cleanup error: {e}")


if __name__ == '__main__':
    # Initialize Google Sheets
    print("[INFO] Initializing Google Sheets connection...")
    init_google_sheets()
    
    # Initialize hardware
    init_hardware()
    
    # Start charging monitor thread
    monitor_thread = threading.Thread(target=charging_monitor, daemon=True)
    monitor_thread.start()
    
    # Start cache monitor thread
    cache_thread = threading.Thread(target=cache_monitor, daemon=True)
    cache_thread.start()
    print("[INFO] Cache monitor started")
    
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
        clear_user_cache()
        cleanup()
    atexit.register(shutdown)
    
    # Run Flask app
    port = int(os.environ.get('PORT', 5000))
    print(f"[INFO] Starting RFID Service on port {port}")
    print(f"[INFO] API available at http://localhost:{port}/api")
    print(f"[INFO] Real-time RFID stream: http://localhost:{port}/api/rfid/stream")
    
    # Print registered RFID cards
    users = load_users()
    print(f"[INFO] Registered RFID Cards ({len(users)}):")
    for user in users:
        print(f"  - {user['rfidCardId']} -> {user['name']} (Balance: ₹{user['balance']:.2f})")
    
    try:
        app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
    except KeyboardInterrupt:
        print("\n[INFO] Shutting down...")
        rfid_reading_active = False
        clear_user_cache()
        cleanup()
        sys.exit(0)
