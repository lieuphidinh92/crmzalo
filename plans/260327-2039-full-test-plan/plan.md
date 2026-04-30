---
title: CRM-Med Full Test Plan — Recent Features
status: pending
created: 2026-03-27
type: test-plan
---

# CRM-Med Full Test Plan — Recent Features

Covers all features deployed from Phase 9 onwards + fixes.

## Test Scope (11 commits, 50+ features)

---

## Phase A: Session & Connection (Priority: CRITICAL)

### A1. Auto-reconnect on disconnect
- [ ] Disconnect Zalo account manually → verify reconnect in 30s
- [ ] Check logs: `[health-check] Reconnecting...` appears
- [ ] Verify DB status updates to `disconnected` then `connected`
- [ ] Socket.IO event `zalo:disconnected` + `zalo:connected` emitted

### A2. Health check cron (5 min)
- [ ] Wait 5 minutes → check logs for health check execution
- [ ] Disconnect account → wait 5 min → should auto-reconnect

### A3. Daily session refresh (04:00 UTC)
- [ ] Verify cron registered: log `[health-check] Zalo health check started`
- [ ] Manual test: not practical (scheduled), verify code logic

### A4. Rate limiter
- [ ] Send 6 messages in 30 seconds → 6th should return 429
- [ ] Send 200+ messages in a day → should block with daily limit message
- [ ] Verify error message: "Gửi quá nhanh" or "Đã đạt giới hạn"

---

## Phase B: Chat Features (Priority: HIGH)

### B1. Send message (User + Group)
- [ ] Send message to individual contact → verify received on Zalo
- [ ] Send message to group chat → verify received on Zalo
- [ ] Verify `ThreadType` correct: User=0, Group=1

### B2. Image rendering
- [ ] Receive image from Zalo → should display as `<img>` not JSON
- [ ] Click image → popup dialog (not new tab)
- [ ] Close popup by clicking
- [ ] Verify images from `zdn.vn` URLs render correctly

### B3. File/PDF preview
- [ ] Receive PDF from Zalo → should show file card (icon + name + size)
- [ ] Click download button → file opens in new tab
- [ ] Verify file size displays correctly (KB/MB)

### B4. Reminder message formatting
- [ ] Receive Zalo calendar reminder → should show styled card with 📅 icon
- [ ] Verify appointment time extracted and displayed
- [ ] Conversation list preview: `📅 Tên nhắc hẹn...`

### B5. Appointment sync from chat
- [ ] Click "Đồng bộ lịch" on reminder card → snackbar success
- [ ] Navigate to /appointments → verify appointment created
- [ ] Verify appointment has `[Zalo]` prefix in notes

### B6. Resizable chat columns
- [ ] Drag left panel resize handle → width changes
- [ ] Drag right panel (contact panel) resize handle → width changes
- [ ] Refresh page → widths restored from localStorage

### B7. Group vs User message display
- [ ] Group message: show sender name above bubble
- [ ] Group conversation: group icon in list + "Nhóm" chip
- [ ] User conversation: user avatar/icon
- [ ] Content type indicators: 📷 🏷️ 🎥 🎤 📎 🔗

### B8. Filter by Zalo account
- [ ] Dropdown in conversation list: select specific account
- [ ] Verify only that account's conversations shown
- [ ] Select "Tất cả" → show all conversations

---

## Phase C: Contact CRM (Priority: HIGH)

### C1. CRM panel in chat sidebar
- [ ] Click contact icon in message header → panel opens
- [ ] Edit: fullName, phone, source, disease, treatment, medication → Save
- [ ] Verify data persisted (close + reopen panel)

### C2. ICD-10 autocomplete
- [ ] Type "viêm" → instant results (no lag)
- [ ] Type "A06" → find by code
- [ ] Select disease → saved correctly
- [ ] Display format: "Tên bệnh - Mã"

### C3. Multi-disease (ContactDisease)
- [ ] Add disease via chat sidebar → appears in list
- [ ] Set status: active/recovering/cured/chronic → correct color chip
- [ ] Delete disease → removed from list
- [ ] Verify disease history preserved in DB

### C4. Medication status options
- [ ] Verify "chưa phối hợp khám" appears in dropdown
- [ ] Verify "cần tư vấn" appears in dropdown
- [ ] Select + save → persisted

### C5. firstContactDate
- [ ] New contact: firstContactDate = null initially
- [ ] Staff replies first time → firstContactDate auto-set
- [ ] Verify in contacts table: "Ngày tiếp nhận" column
- [ ] Verify in chat sidebar: read-only display

### C6. Avatar display
- [ ] Contacts with avatar → shown in conversation list
- [ ] Contacts without avatar → default icon
- [ ] Zalo account avatar → shown after login/reconnect
- [ ] Contacts table → avatar column

### C7. Sync Zalo contacts
- [ ] Go to Zalo Accounts → click sync icon → "Đồng bộ thành công"
- [ ] Navigate to Contacts → verify new contacts created
- [ ] Re-sync → verify updated, not duplicated

---

## Phase D: Patient Directory (Priority: HIGH)

### D1. Patient list page
- [ ] Navigate to /patients → page loads
- [ ] Search by name → filtered
- [ ] Search by phone → filtered

### D2. Create patient
- [ ] Click "Thêm" → fill name + phone + source → Create
- [ ] Verify appears in list
- [ ] Duplicate phone → error

### D3. Auto-merge
- [ ] Click "Tự động merge" → snackbar with created/linked counts
- [ ] Verify contacts with same phone linked to same patient
- [ ] Patient shows multiple "Kênh" chips (Zalo, FB, etc.)

### D4. Patient report
- [ ] Dashboard: patient report card visible
- [ ] Select month → shows new/returning/inactive counts
- [ ] Verify percentages calculate correctly

---

## Phase E: AI Analysis (Priority: MEDIUM)

### E1. AI settings
- [ ] Navigate to /ai-settings → form loads with saved config
- [ ] Change provider → model placeholder updates
- [ ] Save → snackbar success
- [ ] Reload page → settings persisted

### E2. AI connection test
- [ ] Click "Kiểm tra kết nối" → success with preview

### E3. AI job execution
- [ ] Create job → appears in list
- [ ] Trigger job → run appears in history
- [ ] Verify analyzed > 0 conversations
- [ ] View results → scores/classifications shown

### E4. AI insights in chat sidebar
- [ ] Open contact panel → AI section visible
- [ ] Shows latest classification result
- [ ] Shows confidence percentage

---

## Phase F: Notifications & Search (Priority: MEDIUM)

### F1. Notification bell
- [ ] Bell icon in topbar with badge count
- [ ] Click → dropdown with notifications
- [ ] Unreplied >30min → warning notification
- [ ] Today's appointments → info notifications
- [ ] Disconnected Zalo → error notification
- [ ] Auto-refresh every 60 seconds

### F2. Global search
- [ ] Type in search bar → results appear
- [ ] Results grouped: Khách hàng, Tin nhắn, Lịch hẹn
- [ ] Click result → navigates to correct page
- [ ] Debounced 300ms (no excess API calls)

---

## Phase G: Appointments (Priority: MEDIUM)

### G1. Appointments in chat sidebar
- [ ] Open contact panel → appointments section visible
- [ ] Quick-create: fill date + time + notes → "Tạo lịch hẹn"
- [ ] New appointment appears in list
- [ ] Status chip colors correct

### G2. Appointment page
- [ ] Navigate to /appointments → list loads
- [ ] "Hôm nay" tab → only today
- [ ] "Sắp tới" tab → next 7 days
- [ ] "Tất cả" tab → all appointments
- [ ] Mark complete / Cancel → status updates

---

## Phase H: User & Team Management (Priority: LOW)

### H1. User CRUD
- [ ] Add user → appears in list
- [ ] Edit user role → updated
- [ ] Reset password → success
- [ ] Deactivate user → marked inactive

### H2. Team management
- [ ] Create team → appears in list
- [ ] Add member to team → listed
- [ ] Remove member → removed

### H3. Zalo access control
- [ ] Assign access (read/chat/admin) → saved
- [ ] Member login → only sees assigned accounts

---

## Phase I: Dashboard & Reports (Priority: LOW)

### I1. Dashboard KPI
- [ ] 6 KPI cards show real data
- [ ] Charts render (message volume, pipeline, source, appointments)

### I2. Reports
- [ ] Message report with date filter
- [ ] Export Excel → file downloads
- [ ] Patient report (new/returning) in dashboard

---

## Test Execution Order

1. **Smoke (5 min):** A1, B1, C1, D1, F1 → verify core works
2. **Core (20 min):** A1-A4, B1-B5, C1-C5, D1-D3
3. **Full (45 min):** All HIGH + MEDIUM phases
4. **Complete (1.5h):** All phases including LOW

## Test Environment
- **URL:** https://zalo.ngay.top
- **Login:** admin@ngay.top / admin123
- **Zalo accounts:** 5 connected
- **LLM:** qwen3-coder:latest @ ai.ngay.top
