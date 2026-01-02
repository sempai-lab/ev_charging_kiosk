# Google Sheets Integration - How It Works

## 🎯 Overview

Your EV Charging Kiosk backend now uses **Google Sheets** as the database instead of a local JSON file. This provides:
- ✅ Real-time data sync across devices
- ✅ Easy management via Google Sheets UI
- ✅ Automatic backup and version control
- ✅ Multi-user access

## 📊 Data Flow Diagram

```
┌─────────────────┐
│  RFID Hardware  │
│  (MFRC522)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Backend Service│
│  (rfid_service) │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌─────────┐ ┌──────────────┐
│  Cache  │ │ Google Sheets│
│ (30s)   │ │    API       │
└────┬────┘ └──────┬───────┘
     │             │
     └─────┬───────┘
           │
           ▼
    ┌──────────────┐
    │  Flask API   │
    │  (Port 5000) │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │  React UI    │
    │  (Frontend)  │
    └──────────────┘
```

## 🔄 How Data Flows

### 1. **Reading Users (READ from Google Sheets)**

**Trigger**: 
- Backend startup
- Every 5 seconds (automatic polling)
- Cache expiry (30 seconds)
- Manual cache clear

**Process**:
```
1. Backend calls Google Sheets API
2. Reads Sheet2!A2:D (all rows from row 2)
3. Converts each row to user object:
   {
     "id": "1",
     "rfidCardId": "632589166397",  // Column A
     "name": "Lalit Nikumbh",        // Column B
     "phoneNumber": "+91 9876543212", // Column C
     "balance": 100.0                // Column D
   }
4. Stores in cache (30s expiry)
5. Returns to API/UI
```

**Code Location**: `fetch_users_from_sheets()` in `rfid_service.py`

### 2. **Adding New User (WRITE to Google Sheets)**

**Trigger**: 
- New RFID card scanned
- Card ID not found in database

**Process**:
```
1. RFID card detected: "123456789"
2. Check if exists in cache/database → NOT FOUND
3. Call write_user_to_sheets():
   - Find next empty row (e.g., row 5)
   - Write to Sheet2!A5:D5:
     A5: "123456789" (card ID)
     B5: "John Doe" (from card text or default)
     C5: "" (contact - empty)
     D5: "0" (balance - default 0)
4. Clear cache (force refresh)
5. Reload users from Sheets
6. Return user to UI
```

**Code Location**: `write_user_to_sheets()` in `rfid_service.py`

### 3. **Updating Balance (WRITE to Google Sheets)**

**Trigger**: 
- Charging session stops
- Manual balance update via API

**Process**:
```
1. Charging stops
2. Calculate: new_balance = old_balance - deduction
3. Call update_balance_in_sheets():
   - Find user row by card_id
   - Update Column D (balance) only
   - Example: Update Sheet2!D3 to "90.0"
4. Clear cache (force refresh)
5. Update local cache
```

**Code Location**: `update_balance_in_sheets()` in `rfid_service.py`

## 🔌 API Integration Points

### Your Existing UI Calls These APIs:

1. **`GET /api/users`** → Returns users from Google Sheets (via cache)
2. **`GET /api/users/rfid/<rfid_id>`** → Finds user by RFID card ID
3. **`PUT /api/users/<user_id>/balance`** → Updates balance in Google Sheets
4. **`GET /api/rfid/stream`** → Real-time RFID events (unchanged)

### What Changed:

- **Before**: Users stored in `users_data.json` file
- **After**: Users stored in Google Sheets, synced every 5 seconds

### What Stayed the Same:

- ✅ All API endpoints work the same
- ✅ UI code doesn't need changes
- ✅ Real-time RFID streaming unchanged
- ✅ Charging logic unchanged

## 🗂️ Google Sheets Structure

Your sheet should look like this:

| Row | Column A (EID) | Column B (Name) | Column C (Contact) | Column D (Balance) |
|-----|----------------|-----------------|---------------------|---------------------|
| 1   | EID            | Name            | Contact Number      | Current Balance     |
| 2   | 632589166397   | Lalit Nikumbh   | +91 9876543212      | 100.0               |
| 3   | 85525041880    | Fateen Shaikh   | +91 9876543213      | 150.0               |
| 4   | 535830005069   | Nishad Deshmukh | +91 9876543214      | 90.0                |

**Column Mapping**:
- **A** = RFID Card ID (EID) - Used for matching scanned cards
- **B** = User Name - Displayed in UI
- **C** = Contact Number - Optional, displayed in UI
- **D** = Current Balance - Updated when charging stops

## ⚙️ Configuration

### Environment Variables (Optional)

```bash
export GOOGLE_CREDENTIALS_FILE="credentials.json"
export GOOGLE_SHEET_ID="1etezPbLCeZaYXaJtQlwRjCz0lnizOq2xVYppEi1eag8"
export GOOGLE_SHEET_NAME="Sheet2"
```

### Or Edit in Code

```python
# In backend/rfid_service.py
SERVICE_ACCOUNT_FILE = 'credentials.json'  # Your credentials file
SPREADSHEET_ID = 'YOUR_SHEET_ID'           # From Google Sheets URL
SHEET_NAME = 'Sheet2'                      # Your sheet tab name
```

## 🚀 Quick Start

1. **Setup Google Sheets** (see `GOOGLE_SHEETS_INTEGRATION.md`)
2. **Place credentials.json** in `backend/` directory
3. **Install dependencies**:
   ```bash
   pip install -r backend/requirements.txt
   ```
4. **Start backend**:
   ```bash
   python3 backend/rfid_service.py
   ```
5. **Verify connection**:
   ```bash
   curl http://localhost:5000/api/health
   ```
   Should show: `"google_sheets_enabled": true`

## 🔍 How to Verify It's Working

### Check Google Sheets Connection

```bash
curl http://localhost:5000/api/health
```

Response:
```json
{
  "status": "ok",
  "hardware_available": true,
  "google_sheets_enabled": true,
  "charging": false
}
```

### Check Users Loaded

```bash
curl http://localhost:5000/api/users
```

Should return users from your Google Sheet.

### Check Cache Status

```bash
curl http://localhost:5000/api/cache/info
```

Shows cache age and Google Sheets status.

## 🎓 Key Concepts

### 1. **Caching**
- Users cached for 30 seconds
- Reduces Google Sheets API calls
- Automatically refreshes when expired

### 2. **Polling**
- Backend polls Google Sheets every 5 seconds
- Keeps data fresh
- Configurable via `SHEETS_POLL_INTERVAL`

### 3. **Fallback Mode**
- If Google Sheets unavailable, system continues
- Uses cached data if available
- Logs warnings but doesn't crash

### 4. **Automatic User Creation**
- New RFID cards automatically added to sheet
- No manual entry needed
- Balance starts at 0

## 📝 Example Scenarios

### Scenario 1: User Scans Card

1. **Card Scanned**: `632589166397`
2. **Backend checks cache** → Found user "Lalit Nikumbh"
3. **Returns to UI** → Shows name, balance, contact
4. **No Google Sheets call** (using cache)

### Scenario 2: New Card Scanned

1. **Card Scanned**: `999999999999` (new)
2. **Backend checks cache** → Not found
3. **Calls Google Sheets API** → Not in sheet
4. **Writes to Google Sheets** → Adds new row
5. **Clears cache** → Forces refresh
6. **Reloads from Sheets** → Now found
7. **Returns to UI** → Shows new user

### Scenario 3: Charging Stops

1. **Charging session ends**
2. **Calculate deduction**: `balance - (time * rate)`
3. **Update Google Sheets**: Column D updated
4. **Clear cache** → Next read gets fresh data
5. **UI shows updated balance**

## 🛠️ Troubleshooting

### Users Not Loading

1. Check credentials file exists: `ls backend/credentials.json`
2. Check sheet is shared with service account
3. Check API is enabled in Google Cloud Console
4. Check backend logs for errors

### Balance Not Updating

1. Verify Google Sheets enabled: `GET /api/health`
2. Check service account has Editor permissions
3. Verify sheet structure (Column D = Balance)
4. Check backend logs for API errors

### New Users Not Added

1. Check Google Sheets API quota (not exceeded)
2. Verify service account has write permissions
3. Check sheet has empty rows available
4. Review backend logs for write errors

## 📚 Files Changed

1. **`backend/rfid_service.py`** - Integrated Google Sheets API
2. **`backend/requirements.txt`** - Added Google API packages
3. **`GOOGLE_SHEETS_INTEGRATION.md`** - Setup guide
4. **`INTEGRATION_EXPLANATION.md`** - This file

## 🎉 Benefits

✅ **No local file management** - All data in Google Sheets  
✅ **Real-time sync** - Changes visible immediately  
✅ **Easy backup** - Google Sheets auto-saves  
✅ **Multi-device** - Access from anywhere  
✅ **Version history** - Google Sheets tracks changes  
✅ **UI unchanged** - Your React app works the same  

## 🔐 Security

- ✅ Credentials file excluded from git (`.gitignore`)
- ✅ Service account has limited permissions (only your sheet)
- ✅ No user passwords stored
- ✅ HTTPS for all Google API calls

## 📞 Next Steps

1. Follow `GOOGLE_SHEETS_INTEGRATION.md` for setup
2. Test with existing RFID cards
3. Verify balance updates in Google Sheets
4. Monitor backend logs for any issues

Your UI will work exactly the same - the backend now uses Google Sheets instead of a JSON file!

