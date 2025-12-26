# Real-Time RFID Reading Setup

This document describes the real-time RFID reading implementation that automatically detects RFID cards and updates the UI.

## Overview

The system now continuously reads RFID cards in the background and automatically updates the UI when a card is detected, without requiring the user to click the "Scan RFID Card" button.

## Architecture

### Backend (Python/Flask)

1. **Continuous RFID Reading Thread** (`continuous_rfid_reader()`)
   - Runs in background, continuously reading RFID cards
   - Debounces reads (ignores same card for 2 seconds)
   - Automatically starts/stops charging based on card detection
   - Emits events to a queue for real-time updates

2. **Server-Sent Events (SSE) Endpoint** (`/api/rfid/stream`)
   - Streams RFID events to frontend in real-time
   - Events include:
     - `rfid_detected`: Card was scanned
     - `charging_started`: Charging started automatically
     - `charging_stopped`: Charging stopped
     - `insufficient_balance`: Card detected but balance is too low

### Frontend (React/TypeScript)

1. **Hardware Service** (`src/services/hardware.ts`)
   - `startRfidEventStream()`: Connects to SSE endpoint
   - Handles reconnection on errors
   - Supports multiple callbacks for different components

2. **AuthScreen Component** (`src/components/AuthScreen.tsx`)
   - Automatically listens for RFID events on mount
   - Updates UI when valid card is detected
   - Shows error messages for invalid cards or insufficient balance
   - Displays "Real-time scanning active" indicator

## How It Works

1. **Backend Startup**:
   - Initializes RFID reader hardware
   - Starts continuous RFID reading thread
   - Starts SSE endpoint for real-time events

2. **Frontend Connection**:
   - When `AuthScreen` mounts, it calls `hardware.startRfidEventStream()`
   - Establishes SSE connection to `/api/rfid/stream`
   - Listens for events and updates UI automatically

3. **Card Detection Flow**:
   - User places RFID card near reader
   - Backend detects card (with 2-second debounce)
   - Event is emitted to SSE stream
   - Frontend receives event and updates UI
   - If valid user with balance, charging can start automatically

## Usage

### Starting the Backend

```bash
cd backend
python3 rfid_service.py
```

The backend will:
- Initialize hardware (or run in mock mode if not on Raspberry Pi)
- Start continuous RFID reading
- Start Flask server on port 5000
- Stream events to `/api/rfid/stream`

### Frontend

The frontend automatically connects when the `AuthScreen` component is mounted. No additional setup required.

### Manual Scanning (Still Available)

The "Scan RFID Card" button still works for manual scanning if needed.

## Configuration

### Debounce Time

Adjust `RFID_DEBOUNCE_SECONDS` in `backend/rfid_service.py` to change how long the system ignores the same card:

```python
RFID_DEBOUNCE_SECONDS = 2  # Ignore same card for 2 seconds
```

### API URL

Set the backend URL in your `.env` file or environment:

```bash
VITE_RFID_API_URL=http://localhost:5000/api
```

## Troubleshooting

### RFID Not Detecting

1. Check backend logs for hardware initialization errors
2. Verify RFID reader is connected properly
3. Check if backend is running: `curl http://localhost:5000/api/health`

### Events Not Reaching Frontend

1. Check browser console for SSE connection errors
2. Verify CORS is enabled in Flask backend
3. Check network tab for `/api/rfid/stream` connection

### Mock Mode

If hardware libraries are not available, the system runs in mock mode:
- RFID reader returns mock card IDs
- Relay control is simulated
- All functionality works for testing

## Testing

1. Start backend: `python3 backend/rfid_service.py`
2. Start frontend: `npm run dev`
3. Open browser to frontend URL
4. Place RFID card near reader (or use mock mode)
5. UI should automatically update when card is detected

## Notes

- The continuous reading thread runs independently of HTTP requests
- Multiple frontend clients can connect to the same SSE stream
- Events are queued and delivered to all connected clients
- The system gracefully handles connection errors and reconnects automatically

