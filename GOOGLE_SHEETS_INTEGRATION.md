# Google Sheets Integration Guide

## Overview

The EV Charging Kiosk backend now integrates with Google Sheets for user management. This allows you to:
- **READ** users from Google Sheets (automatic sync every 5 seconds)
- **WRITE** new users to Google Sheets when new RFID cards are scanned
- **UPDATE** user balances in Google Sheets in real-time

## How It Works

### Architecture Flow

```
RFID Hardware → Backend Service → Google Sheets API
                      ↓
                 Local Cache (30s expiry)
                      ↓
              Flask API → React UI
```

### Key Components

1. **Google Sheets API**: Reads/writes user data
2. **Local Cache**: Caches users for 30 seconds to reduce API calls
3. **Automatic Sync**: Polls Google Sheets every 5 seconds
4. **Real-time Updates**: Updates balance in Sheets when charging stops

## Setup Instructions

### Step 1: Create Google Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable **Google Sheets API**:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Sheets API"
   - Click "Enable"

4. Create Service Account:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "Service Account"
   - Name it (e.g., "ev-charging-kiosk")
   - Click "Create and Continue"
   - Skip role assignment (optional)
   - Click "Done"

5. Create Key:
   - Click on the created service account
   - Go to "Keys" tab
   - Click "Add Key" > "Create new key"
   - Select "JSON" format
   - Download the JSON file
   - **Rename it to `credentials.json`**

### Step 2: Share Google Sheet

1. Open your Google Sheet
2. Click "Share" button
3. Add the service account email (found in `credentials.json` as `client_email`)
4. Give it **Editor** permissions
5. Copy the **Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
   ```

### Step 3: Configure Sheet Structure

Your Google Sheet should have this structure:

| Column A (EID) | Column B (Name) | Column C (Contact) | Column D (Balance) |
|----------------|-----------------|---------------------|---------------------|
| 632589166397   | Lalit Nikumbh   | +91 9876543212      | 100.0               |
| 85525041880    | Fateen Shaikh   | +91 9876543213      | 150.0               |
| 535830005069   | Nishad Deshmukh | +91 9876543214      | 90.0                |

**Important:**
- Row 1 is the header (will be skipped)
- Data starts from Row 2
- Column A = RFID Card ID (EID)
- Column B = User Name
- Column C = Contact Number
- Column D = Current Balance

### Step 4: Place Credentials File

1. Copy `credentials.json` to the `backend/` directory:
   ```bash
   cp ~/Downloads/credentials.json backend/credentials.json
   ```

2. **IMPORTANT**: Add to `.gitignore` to prevent committing credentials:
   ```bash
   echo "backend/credentials.json" >> .gitignore
   ```

### Step 5: Configure Environment Variables (Optional)

You can customize these in the code or via environment variables:

```bash
export GOOGLE_CREDENTIALS_FILE="credentials.json"
export GOOGLE_SHEET_ID="1etezPbLCeZaYXaJtQlwRjCz0lnizOq2xVYppEi1eag8"
export GOOGLE_SHEET_NAME="Sheet2"
```

Or edit directly in `backend/rfid_service.py`:
```python
SERVICE_ACCOUNT_FILE = 'credentials.json'
SPREADSHEET_ID = 'YOUR_SHEET_ID'
SHEET_NAME = 'Sheet2'
```

### Step 6: Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

This installs:
- `google-auth` - Authentication
- `google-api-python-client` - Google Sheets API client
- Other required packages

## How It Works - Detailed Flow

### 1. Reading Users (READ Operation)

**When**: 
- On startup
- Every 5 seconds (polling interval)
- When cache expires (30 seconds)

**Process**:
```python
fetch_users_from_sheets() → Reads Sheet2!A2:D → Converts to user objects → Updates cache
```

**API Call**:
```
GET https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/values/Sheet2!A2:D
```

### 2. Adding New Users (WRITE Operation)

**When**: 
- New RFID card is scanned
- Card ID not found in database

**Process**:
```python
RFID Card Scanned → Not in database → write_user_to_sheets() → Adds to next row → Clears cache
```

**API Call**:
```
PUT https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/values/Sheet2!A{N}:D{N}
Body: [[card_id, name, contact, balance]]
```

### 3. Updating Balance (WRITE Operation)

**When**: 
- Charging session stops
- Balance is manually updated via API

**Process**:
```python
Charging Stops → Calculate deduction → update_balance_in_sheets() → Updates Column D → Clears cache
```

**API Call**:
```
PUT https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/values/Sheet2!D{ROW}
Body: [[new_balance]]
```

## Code Integration Points

### Main Functions

1. **`init_google_sheets()`**: Initializes Google Sheets API connection
   - Called on startup
   - Returns `True` if successful, `False` otherwise

2. **`fetch_users_from_sheets()`**: Reads users from Google Sheets
   - Respects polling interval (5 seconds)
   - Returns list of user dictionaries

3. **`write_user_to_sheets(card_id, card_text)`**: Adds new user
   - Finds next empty row
   - Writes card_id, name, contact, balance

4. **`update_balance_in_sheets(card_id, new_balance)`**: Updates balance
   - Finds user by card_id
   - Updates Column D (balance)

### Integration with Existing Code

**User Loading**:
```python
def load_users(use_cache=True):
    # 1. Check cache first
    # 2. If cache expired, fetch from Google Sheets
    # 3. Update cache
    # 4. Return users
```

**User Saving**:
```python
def save_users(users):
    # Updates are handled individually via update_balance_in_sheets()
    # Bulk updates would need additional implementation
```

**Balance Updates**:
```python
def update_user_balance(user_id, new_balance):
    # 1. Find user in local cache
    # 2. Update Google Sheets via API
    # 3. Update local cache
```

## Fallback Mode

If Google Sheets is not available:
- System continues to work
- Users are loaded from cache (if available)
- New users are not persisted
- Balance updates are not synced

**Check status**:
```bash
curl http://localhost:5000/api/health
```

Response includes `google_sheets_enabled: true/false`

## Testing

### Test Reading Users

1. Start backend:
   ```bash
   python3 backend/rfid_service.py
   ```

2. Check if users are loaded:
   ```bash
   curl http://localhost:5000/api/users
   ```

3. Check cache status:
   ```bash
   curl http://localhost:5000/api/cache/info
   ```

### Test Adding New User

1. Scan a new RFID card (not in sheet)
2. Check backend logs - should show:
   ```
   [INFO] New card detected. Adding to Google Sheets...
   [SHEETS] ✓ Added new user to row X
   ```

3. Verify in Google Sheet - new row should appear

### Test Balance Update

1. Start charging session
2. Stop charging session
3. Check backend logs - should show:
   ```
   [SHEETS] ✓ Updated balance for card X to ₹Y
   ```

4. Verify in Google Sheet - balance should be updated

## Troubleshooting

### Error: "credentials.json file not found"

**Solution**: 
- Ensure `credentials.json` is in `backend/` directory
- Check file permissions: `chmod 600 backend/credentials.json`

### Error: "Permission denied"

**Solution**:
- Share Google Sheet with service account email
- Ensure service account has **Editor** permissions

### Error: "API not enabled"

**Solution**:
- Enable Google Sheets API in Google Cloud Console
- Wait a few minutes for propagation

### Users not syncing

**Solution**:
- Check polling interval (default 5 seconds)
- Check cache expiry (default 30 seconds)
- Manually clear cache: `POST /api/cache/clear`

### Balance not updating

**Solution**:
- Check if Google Sheets is enabled: `GET /api/health`
- Check backend logs for errors
- Verify service account has write permissions

## Performance Considerations

1. **Caching**: Users are cached for 30 seconds to reduce API calls
2. **Polling**: Google Sheets is polled every 5 seconds (configurable)
3. **Debouncing**: Same RFID card ignored for 5 seconds
4. **Batch Updates**: Consider implementing batch updates for better performance

## Security Notes

1. **Never commit `credentials.json`** to git
2. **Restrict file permissions**: `chmod 600 credentials.json`
3. **Use environment variables** for sensitive data in production
4. **Rotate service account keys** periodically
5. **Limit service account permissions** to only necessary sheets

## Next Steps

- [ ] Set up Google Cloud project
- [ ] Create service account and download credentials
- [ ] Share Google Sheet with service account
- [ ] Place credentials.json in backend/
- [ ] Test reading users
- [ ] Test adding new users
- [ ] Test balance updates

## Support

If you encounter issues:
1. Check backend logs for error messages
2. Verify Google Sheets API is enabled
3. Verify service account permissions
4. Check network connectivity
5. Review this guide for configuration steps

