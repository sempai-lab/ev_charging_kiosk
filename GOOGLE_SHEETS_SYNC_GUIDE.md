# Complete Google Sheets Sync Guide

## ✅ Full Integration Complete

Your EV Charging Kiosk is now **fully synced** with Google Sheets as the database. All read and write operations go through Google Sheets.

## 🔄 How Full Sync Works

### **READ Operations (Google Sheets → Backend → UI)**

1. **Backend Polls Google Sheets**:
   - Every 3 seconds (configurable)
   - Reads all users from Sheet2!A2:D
   - Updates local cache (10-second expiry)

2. **UI Requests Users**:
   - Frontend calls `GET /api/users`
   - Backend returns cached data (if fresh) or fetches from Google Sheets
   - UI displays users from Google Sheets

3. **Automatic Background Sync**:
   - Background thread syncs every 30 seconds
   - Ensures data is always fresh

### **WRITE Operations (UI → Backend → Google Sheets)**

1. **Balance Updates**:
   ```
   Admin Panel → PUT /api/users/{id}/balance → update_balance_in_sheets() → Google Sheets Column D
   ```

2. **User Info Updates**:
   ```
   Admin Panel → PUT /api/users/{id} → update_user_in_sheets() → Google Sheets Columns A/B/C
   ```

3. **New User Creation**:
   ```
   RFID Scan → write_user_to_sheets() → Google Sheets (new row)
   ```

4. **Charging Balance Deduction**:
   ```
   Charging Stops → update_balance_in_sheets() → Google Sheets Column D
   ```

## 📊 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    GOOGLE SHEETS (Database)                  │
│  Sheet2: Column A (RFID) | B (Name) | C (Contact) | D (Balance) │
└───────────────────────────────┬─────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
            [READ every 3s]         [WRITE immediately]
                    │                       │
                    ▼                       ▼
        ┌───────────────────┐   ┌───────────────────┐
        │  Backend Cache    │   │  Backend API      │
        │  (10s expiry)     │   │  (Flask)          │
        └─────────┬─────────┘   └─────────┬─────────┘
                  │                       │
                  └───────────┬───────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │  React UI          │
                    │  (Frontend)        │
                    └───────────────────┘
```

## 🔧 Backend API Endpoints

### User Operations (All Sync to Google Sheets)

1. **`GET /api/users`** - Get all users from Google Sheets
2. **`GET /api/users/<user_id>`** - Get user by ID
3. **`GET /api/users/rfid/<rfid_id>`** - Get user by RFID card ID
4. **`PUT /api/users/<user_id>/balance`** - Update balance → Google Sheets
5. **`PUT /api/users/<user_id>`** - Update user info → Google Sheets

### How Each Endpoint Syncs

#### Reading Users
```python
GET /api/users
  → load_users()
    → fetch_users_from_sheets()  # Reads from Google Sheets
      → Updates cache
        → Returns to UI
```

#### Updating Balance
```python
PUT /api/users/{id}/balance
  → update_user_balance()
    → update_balance_in_sheets()  # Writes to Google Sheets Column D
      → Clears cache
        → Returns updated user
```

#### Updating User Info
```python
PUT /api/users/{id}
  → update_user()
    → update_user_in_sheets()  # Writes to Google Sheets Columns A/B/C
      → Clears cache
        → Returns updated user
```

## 🎯 Frontend Changes

### Database Service (`src/services/database.ts`)

**Before**: Used `localStorage` for users
```typescript
getUsers(): User[] {
  return JSON.parse(localStorage.getItem('users'));
}
```

**After**: Uses Backend API (which reads from Google Sheets)
```typescript
async getUsers(): Promise<User[]> {
  const response = await fetch(`${API_BASE_URL}/users`);
  return await response.json();  // Data from Google Sheets
}
```

### Admin Panel (`src/components/AdminPanel.tsx`)

**Before**: Updated `localStorage` directly
```typescript
db.updateUserBalance(userId, newBalance);  // Only localStorage
```

**After**: Updates via Backend API (syncs to Google Sheets)
```typescript
await db.updateUserBalance(userId, newBalance);  // → Backend → Google Sheets
```

## ⚙️ Configuration

### Sync Intervals

- **Google Sheets Polling**: 3 seconds
- **Cache Expiry**: 10 seconds
- **Background Sync**: 30 seconds
- **Cache Check**: Every 10 seconds

### Adjust in Code

```python
# backend/rfid_service.py
SHEETS_POLL_INTERVAL = 3  # Poll Google Sheets every 3 seconds
CACHE_EXPIRY_SECONDS = 10  # Cache expires after 10 seconds
```

## 🔍 Verification Steps

### 1. Check Google Sheets Connection

```bash
curl http://localhost:5000/api/health
```

Should return:
```json
{
  "status": "ok",
  "google_sheets_enabled": true
}
```

### 2. Verify Users Load from Google Sheets

```bash
curl http://localhost:5000/api/users
```

Should return users from your Google Sheet.

### 3. Test Balance Update

```bash
curl -X PUT http://localhost:5000/api/users/1/balance \
  -H "Content-Type: application/json" \
  -d '{"balance": 200.0}'
```

Check Google Sheets - Column D for user 1 should update to `200.0`.

### 4. Test User Info Update

```bash
curl -X PUT http://localhost:5000/api/users/1 \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Name", "phoneNumber": "+91 9999999999"}'
```

Check Google Sheets - Columns B and C should update.

## 📝 Complete Sync Checklist

✅ **Backend reads from Google Sheets** - Every 3 seconds  
✅ **Backend writes to Google Sheets** - Immediately on updates  
✅ **Frontend uses Backend API** - No localStorage for users  
✅ **Admin Panel syncs changes** - All updates go to Google Sheets  
✅ **Balance updates sync** - Charging deductions update Sheets  
✅ **New users added** - New RFID cards automatically added to Sheets  
✅ **Cache management** - Auto-refreshes from Google Sheets  
✅ **Background sync** - Periodic sync every 30 seconds  

## 🎓 Key Functions

### Backend Functions

1. **`fetch_users_from_sheets()`** - Reads from Google Sheets
2. **`write_user_to_sheets()`** - Adds new user to Google Sheets
3. **`update_balance_in_sheets()`** - Updates balance in Google Sheets
4. **`update_user_in_sheets()`** - Updates user info in Google Sheets
5. **`load_users()`** - Loads users (from cache or Google Sheets)

### Frontend Functions

1. **`db.getUsers()`** - Fetches from Backend API (async)
2. **`db.updateUserBalance()`** - Updates via Backend API (async)
3. **`db.updateUser()`** - Updates user info via Backend API (async)

## 🚀 Real-World Example

### Scenario: Admin Updates Balance

1. **Admin clicks "Adjust Balance"** in Admin Panel
2. **Frontend calls**: `PUT /api/users/1/balance` with `{"balance": 250.0}`
3. **Backend**:
   - Finds user by ID
   - Calls `update_balance_in_sheets(card_id="632589166397", balance=250.0)`
   - Updates Google Sheets Column D, Row 2
   - Clears cache
4. **Google Sheets** updates immediately
5. **Next read** (within 3 seconds) gets updated balance
6. **UI refreshes** showing new balance

### Scenario: New RFID Card Scanned

1. **Card scanned**: `999999999999`
2. **Backend checks**: Not in database
3. **Backend calls**: `write_user_to_sheets("999999999999", "New User")`
4. **Google Sheets**: New row added
5. **Backend**: Clears cache, fetches fresh data
6. **User found**: Returns to UI
7. **UI displays**: New user info

## 🔐 Data Integrity

- ✅ **Single Source of Truth**: Google Sheets
- ✅ **Immediate Writes**: All updates go to Google Sheets first
- ✅ **Cache Invalidation**: Cache cleared on every write
- ✅ **Force Refresh**: New users force immediate fetch
- ✅ **Error Handling**: Falls back gracefully if Sheets unavailable

## 📊 Monitoring

Check sync status:
```bash
curl http://localhost:5000/api/cache/info
```

Response:
```json
{
  "cached": true,
  "age_seconds": 5.2,
  "expiry_seconds": 10,
  "is_valid": true,
  "cache_size": 3,
  "google_sheets_enabled": true
}
```

## 🎉 Benefits

1. **Real-time Sync**: Changes visible across all devices
2. **No Data Loss**: All data in Google Sheets (cloud backup)
3. **Easy Management**: Edit users directly in Google Sheets
4. **Version History**: Google Sheets tracks all changes
5. **Multi-user Access**: Multiple admins can manage simultaneously
6. **Automatic Backup**: Google Sheets auto-saves

Your system is now **fully integrated** with Google Sheets as the database! 🚀


system is ready

