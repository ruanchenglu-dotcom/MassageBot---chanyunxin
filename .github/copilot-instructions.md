# MassageBot Copilot Instructions

## Project Overview

**MassageBot** is a LINE-based massage shop booking system featuring real-time resource management and staff scheduling. It operates as a full-stack application with:
- **Backend**: Node.js/Express server managing LINE webhooks, Google Sheets integration, and booking logic
- **Admin Dashboard**: React-based web UI for shop management (`XinWuChanAdmin/`)
- **Data Source**: Google Sheets for persistent bookings, staff schedules, and salary tracking

## Critical Architecture

### Data Flow Architecture
```
LINE User Message → Line Webhook (/callback) → handleEvent()
                                                     ↓
                    ← Check Resource Availability (resource_core.js)
                                                     ↓
                    → Store in Google Sheets (ghiVaoSheet)
                                                     ↓
Admin Dashboard (React) ← syncData() fetches live data ← Google Sheets
                                                     ↓
                    Server State (SERVER_RESOURCE_STATE, SERVER_STAFF_STATUS)
```

### Core Data Structures

**Booking Object** (from Google Sheets, columns A-W):
```javascript
{
  rowId,                 // Row number in Sheet1
  date,                  // "YYYY/MM/DD" (Column A)
  startTime,             // "HH:MM" format (Column B)
  duration,              // Minutes (inferred from service)
  serviceCode,           // Key in SERVICES object
  serviceName,           // Display name
  staffId,               // Column H: Single staff or "隨機" (random)
  pax,                   // Number of guests (Column E)
  customerName,          // Column C
  phone,                 // Column F
  isOil,                 // Column D: "Yes"/"No"
  status                 // Column G: "已預約", "取消", etc.
}
```

**Staff Object** (from StaffSchedule sheet):
```javascript
{
  id,           // Column A: Staff name/ID
  name,
  gender,       // Column B: 'F' or 'M'
  shiftStart,   // Column C: "HH:MM"
  shiftEnd,     // Column D: "HH:MM"
  offDays       // Array of "YYYY/MM/DD" dates marked "OFF"
}
```

**Service Object** (from menu sheet, columns A-D):
```javascript
{
  code,        // Column A: Service code (A1, F40, B90, etc.)
  name,        // Column B: Display name with emoji
  duration,    // Extracted from name or Column C
  type,        // 'BED' or 'CHAIR'
  category,    // 'COMBO', 'FOOT', 'BODY', or 'SYSTEM'
  price        // Column D: Service price
}
```

## Essential Files & Responsibilities

### Backend Core
- **`index.js`** (811 lines): Main server - handles LINE webhooks, API routes, booking writes, syncs
  - `handleEvent()`: Routes user messages to appropriate handlers
  - `syncData()`: Fetches bookings + staff schedules from Google Sheets
  - `syncMenuData()`: Loads services (called sparingly to avoid quota 429 errors)
  - `ghiVaoSheet()`: Writes bookings to Sheet1

- **`resource_core.js`** (426 lines): Smart resource availability checker
  - `CONFIG`: MAX_CHAIRS=6, MAX_BEDS=6, buffers (5min cleanup, 5min transition)
  - `checkRequestAvailability()`: Core algo checking if request fits into timeline
  - `getTaipeiNow()`: Native JS (no moment.js) for Taiwan timezone (UTC+8)
  - Uses tetris-style logic to pack guests into available slots

### Admin Dashboard (React)
- **`XinWuChanAdmin/js/app.js`**: Main React component managing tabs (map, timeline, commission)
  - State: `resourceState`, `staffList`, `bookings`, `viewDate`
  - Polling syncs from server via `/api/info`

- **`XinWuChanAdmin/js/bookingHandler.js`** (V57): Next-day availability scanner
  - "Smart Next-Day Scanner": Scans tomorrow's slots starting at OPEN_HOUR (8:00)
  - Never uses moment.js - only native Date objects
  - `SHOP_CONFIG`: OPEN_HOUR=8, CLOSE_HOUR=3 (next day), ALLOW_LAST_ORDER=60min

- **`XinWuChanAdmin/js/components.js`**: UI components (modals, buttons)
- **`XinWuChanAdmin/js/views.js`**: Timeline/map rendering
- **`XinWuChanAdmin/js/staffSorter.js`**: Staff availability logic
- **`XinWuChanAdmin/js/utils.js`**: Helper functions
- **`XinWuChanAdmin/js/salary_sync.js`**: Commission calculations

## Project-Specific Conventions & Patterns

### 1. **Timezone Handling (CRITICAL)**
- **Always** use `getTaipeiNow()` from `resource_core.js` or `index.js`
- Never import `moment.js` or `moment-timezone` (deployment conflicts)
- All dates stored as strings: `"YYYY/MM/DD"` (slash, not hyphen)
- All times stored as strings: `"HH:MM"` (24-hour)
- Server assumes Taiwan timezone (UTC+8)

### 2. **Google Sheets Integration**
- Uses Google Sheets API v4 with service account auth (`google-key.json`)
- Sheet names (tabs) are constants: `BOOKING_SHEET`, `STAFF_SHEET`, `SCHEDULE_SHEET`, `SALARY_SHEET`, `MENU_SHEET`
- **Quota Risk**: syncMenuData() called rarely. Each read = 1 quota unit. Batch reads to one call when possible
- Column mapping: Bookings (A-W), Staff Schedule (A-BG100)

### 3. **LINE Bot Message Patterns**
- **Flex Messages** (complex UI): Use carousel with bubble objects
- **Template Messages** (date picker): For date selection (`datetimepicker`)
- Message flow uses `userState[userId]` to track conversation step (e.g., `ADMIN_PICK_STAFF`)
- Admin commands start with `Admin:` prefix; dates parsed as `Date:YYYY/MM/DD`

### 4. **Resource Availability Logic**
- **Tetris Algorithm** in `resource_core.js`:
  - Guest → Service → Staff assignment
  - Check overlap with 1-min tolerance: `isOverlap(startA, endA, startB, endB)`
  - Cleanup buffer (5min) added after each service
  - Combo services have 5min transition between phases
- **Optimization**: Always check feasibility BEFORE writing to sheets
- All calculations in minutes since 00:00

### 5. **Admin Dashboard Syncing**
- Frontend polls `/api/info` every few seconds
- Server-side state: `SERVER_RESOURCE_STATE` (resource timelines), `SERVER_STAFF_STATUS`
- Booking updates via `/api/update-status` or `/api/update-booking-details`
- Multiple staff per booking supported (staff2, staff3, etc. up to staff6)

### 6. **Service Codes & Categories**
- Service codes: Prefix determines type (A=COMBO, F=FOOT, B=BODY)
- System services: 'OFF_DAY', 'BREAK_30', 'SHOP_CLOSE' (never bookable)
- Duration patterns: Name includes "分" (minutes) - parse via regex: `/(\d+)分/`

### 7. **Debugging & Logging**
- Console logs use prefixes: `[SYNC]`, `[MENU]`, `[CORE V2.5]`, `[LINE WEBHOOK ERROR]`
- Frontend has `DEBUG_MODE` in `bookingHandler.js` (set `true` for verbose logging)
- Staff gender filtering: Compare with 'F' or '女' for female (used in booking UI)

## Critical Developer Workflows

### Starting the Server
```bash
node index.js
```
Requires `.env` file with:
- `CHANNEL_ACCESS_TOKEN`: LINE channel token
- `CHANNEL_SECRET`: LINE channel secret
- `ID_BA_CHU`: Line ID of shop owner (for admin messages)
- `SHEET_ID`: Google Sheet ID

### Accessing Admin Dashboard
- Local: `http://localhost:5000/admin2/`
- Serves from `XinWuChanAdmin/` folder
- Uses `/api/info` to fetch live state every sync interval

### Deployment Notes
- Production: `len.bat` script may handle deployment
- Avoid moment.js - use native Date only
- Google Sheets quota: Monitor API calls (especially during heavy syncing)
- Timezone: Server assumes Taiwan (UTC+8)

### Testing Booking Flow
1. Modify `SERVICES` in `index.js` or Google Sheets menu tab
2. Call `/api/admin-booking` with booking data to simulate
3. Check `/api/info` response for updated `SERVER_RESOURCE_STATE`

## Integration Points & External Dependencies

- **@line/bot-sdk**: LINE messaging API client
- **googleapis**: Google Sheets API
- **express**: Web framework
- **cors**: Cross-origin requests (admin dashboard)
- **dotenv**: Environment variables

## Key Gotchas & Common Mistakes

1. **Don't call `syncMenuData()` in sync loops** - causes quota 429 errors. Call manually or on-demand.
2. **Date/time string format matters**: Use `"YYYY/MM/DD"` and `"HH:MM"`. Other formats will fail parsing.
3. **Staff "隨機" (random)** means any available staff - don't force a specific ID.
4. **Overlap detection**: Uses 1-min tolerance. A 60-min service at 10:00 overlaps with one at 10:59.
5. **Admin-only features**: Check `userId === ID_BA_CHU` for access control.
6. **Gender filtering**: Frontend uses emoji (pink for F, blue for M) - maintain in UI.
