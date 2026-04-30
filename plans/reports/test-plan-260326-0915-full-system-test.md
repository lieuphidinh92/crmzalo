# Test Plan: Zalo Sales CRM — Full System Test

**Date:** 2026-03-26 | **URL:** https://zalo.ngay.top | **Version:** 1.0.0

---

## System Overview

- **Backend:** 38 TypeScript files (Node.js + Fastify 5 + Prisma 7 + Socket.IO)
- **Frontend:** 46 files (Vue 3 + Vuetify 3 + Chart.js)
- **Database:** PostgreSQL 16 (16 tables)
- **Containers:** app + db + backup (all running)
- **Zalo:** zca-js 2.x (1 account connected)

---

## Test Categories

### 1. Auth & Setup (Phase 1+4)

| # | Test Case | Steps | Expected | Priority |
|---|-----------|-------|----------|----------|
| 1.1 | First-time setup | Open fresh URL → /setup page | Setup form shown | HIGH |
| 1.2 | Create admin | Fill org name + name + email + password → Submit | Account created, redirected to / | HIGH |
| 1.3 | Login | /login → enter credentials | JWT token, redirected to dashboard | HIGH |
| 1.4 | Token persistence | Refresh page after login | Still authenticated | HIGH |
| 1.5 | Logout | Click logout icon | Redirected to /login, token cleared | MEDIUM |
| 1.6 | Invalid login | Enter wrong password | Error alert shown | MEDIUM |
| 1.7 | Profile display | Login → check topbar | User full name shown | LOW |

### 2. User Management (Phase 4)

| # | Test Case | Steps | Expected | Priority |
|---|-----------|-------|----------|----------|
| 2.1 | List users | Settings → Nhân viên tab | Users table shown | HIGH |
| 2.2 | Add user | Click "Thêm nhân viên" → fill form | User created, appears in list | HIGH |
| 2.3 | Edit user | Click edit on user row | Update name/email/role works | MEDIUM |
| 2.4 | Reset password | Click password icon | New password accepted | MEDIUM |
| 2.5 | Deactivate user | Click delete → confirm | User marked inactive | MEDIUM |
| 2.6 | Role guard | Login as member → try add user | 403 or button hidden | HIGH |

### 3. Team Management (Phase 4)

| # | Test Case | Steps | Expected | Priority |
|---|-----------|-------|----------|----------|
| 3.1 | Create team | Settings → Đội nhóm → Thêm | Team created | MEDIUM |
| 3.2 | Add member | Expand team → Add member | User assigned to team | MEDIUM |
| 3.3 | Remove member | Click remove on member | User unassigned | MEDIUM |
| 3.4 | Delete team | Delete team with members | Team deleted, members unassigned | LOW |

### 4. Zalo Account Management (Phase 2)

| # | Test Case | Steps | Expected | Priority |
|---|-----------|-------|----------|----------|
| 4.1 | Add account | Tài khoản Zalo → Thêm Zalo | Account record created | HIGH |
| 4.2 | QR login | Click QR icon → scan with Zalo app | QR displayed, status → connected | HIGH |
| 4.3 | Auto-reconnect | Restart app container | Account auto-reconnects without QR | HIGH |
| 4.4 | Disconnect alert | Stop listener manually | Status → disconnected, UI updates | MEDIUM |
| 4.5 | Remove account | Click delete → confirm | Account removed from pool + DB | MEDIUM |
| 4.6 | Access control | Assign user access (read/chat) | User sees only permitted accounts | HIGH |

### 5. Real-time Chat (Phase 3)

| # | Test Case | Steps | Expected | Priority |
|---|-----------|-------|----------|----------|
| 5.1 | Receive message | Send Zalo message to connected account | Message appears in chat UI < 2s | HIGH |
| 5.2 | Auto-create contact | New person sends first message | Contact created automatically | HIGH |
| 5.3 | Send reply | Type reply in web → Enter | Message sent via Zalo, saved to DB | HIGH |
| 5.4 | Message order | Send multiple messages | Newest at bottom, auto-scroll | MEDIUM |
| 5.5 | Deleted message | Recall message on Zalo | Web shows "(đã thu hồi)" strikethrough, content preserved in DB | HIGH |
| 5.6 | Conversation list | Multiple contacts chat | List sorted by last message time | MEDIUM |
| 5.7 | Search conversations | Type contact name in search | Filtered results | MEDIUM |
| 5.8 | Mark as read | Click conversation | Unread count resets to 0 | LOW |
| 5.9 | CRM panel in chat | Click contact icon in chat header | Side panel opens with CRM fields | MEDIUM |
| 5.10 | Edit CRM in chat | Update disease/status in panel → Save | Saved, form retains data | MEDIUM |

### 6. Patient CRM (Phase 5)

| # | Test Case | Steps | Expected | Priority |
|---|-----------|-------|----------|----------|
| 6.1 | Contact list | Khách hàng page | Table with all contacts | HIGH |
| 6.2 | Filter by source | Select "Facebook" in filter | Only FB contacts shown | MEDIUM |
| 6.3 | Filter by status | Select medication status | Filtered correctly | MEDIUM |
| 6.4 | Add contact | Click "Thêm KH" → fill form | Contact created | HIGH |
| 6.5 | ICD-10 search | Type "viêm" in disease field | Autocomplete shows results instantly | HIGH |
| 6.6 | ICD-10 by code | Type "A06" in disease field | Matches by code | HIGH |
| 6.7 | Save disease | Select ICD-10 → Save | Disease code + name persisted, shown on reopen | HIGH |
| 6.8 | Appointment date | Set next appointment → Save | Date persisted, shown on reopen | HIGH |
| 6.9 | Tags | Add tags via combobox → Save | Tags saved and displayed | MEDIUM |
| 6.10 | Delete contact | Open contact → Xoá → confirm | Contact removed | LOW |

### 7. ICD-10 Management

| # | Test Case | Steps | Expected | Priority |
|---|-----------|-------|----------|----------|
| 7.1 | List codes | Mã bệnh ICD-10 page | 245 codes in table | MEDIUM |
| 7.2 | Search codes | Type in search field | Filtered by code or name | MEDIUM |
| 7.3 | Add code | Click "Thêm mã bệnh" → fill | New code created | LOW |
| 7.4 | Edit code | Click edit → change name | Updated | LOW |
| 7.5 | Delete code | Click delete → confirm | Code removed | LOW |

### 8. Appointments (Phase 5)

| # | Test Case | Steps | Expected | Priority |
|---|-----------|-------|----------|----------|
| 8.1 | Create appointment | Lịch hẹn → Tạo → fill form | Appointment created | HIGH |
| 8.2 | Today tab | Click "Hôm nay" tab | Only today's appointments | MEDIUM |
| 8.3 | Upcoming tab | Click "Sắp tới" tab | Next 7 days shown | MEDIUM |
| 8.4 | Mark complete | Click checkmark action | Status → completed (green chip) | MEDIUM |
| 8.5 | Cancel appointment | Click cancel action | Status → cancelled (grey chip) | LOW |
| 8.6 | Reminder cron | Wait for 8AM or trigger | Socket.IO notification emitted | LOW |

### 9. AI Analysis (Phase 6)

| # | Test Case | Steps | Expected | Priority |
|---|-----------|-------|----------|----------|
| 9.1 | Configure AI | Cấu hình AI → select Local LLM → fill → Save | Settings saved | HIGH |
| 9.2 | Test connection | Click "Kiểm tra kết nối" | Success/error message shown | HIGH |
| 9.3 | Create QC job | Công việc AI → Tạo → QC type | Job created | HIGH |
| 9.4 | Create classify job | Tạo → Classification type | Job created | MEDIUM |
| 9.5 | Trigger job | Click "Chạy ngay" | Run appears in history | HIGH |
| 9.6 | View results | Click run → view results | Scores/classifications shown | HIGH |
| 9.7 | Scheduled job | Set cron "0 8 * * *" → wait or trigger | Auto-runs on schedule | MEDIUM |
| 9.8 | Provider switch | Change from local to Claude/Gemini | Works with correct API | LOW |

### 10. Dashboard & Reports (Phase 7)

| # | Test Case | Steps | Expected | Priority |
|---|-----------|-------|----------|----------|
| 10.1 | KPI cards | Dashboard page | 6 metric cards with real data | HIGH |
| 10.2 | Message volume chart | Dashboard | Bar chart (sent/received per day) | MEDIUM |
| 10.3 | Pipeline chart | Dashboard | Doughnut chart (medication status) | MEDIUM |
| 10.4 | Source chart | Dashboard | Pie chart (FB/TT/GT/CN) | MEDIUM |
| 10.5 | Report messages | Báo cáo → Tin nhắn tab | Table with daily counts | MEDIUM |
| 10.6 | Export Excel | Click "Xuất Excel" | .xlsx file downloaded | MEDIUM |
| 10.7 | Date filter | Change date range → click Xem | Charts/tables update | MEDIUM |

### 11. UI/UX (Liquid Silicon Theme)

| # | Test Case | Steps | Expected | Priority |
|---|-----------|-------|----------|----------|
| 11.1 | Dark mode default | Open app first time | Dark theme with navy/cyan | HIGH |
| 11.2 | Light mode toggle | Click sun/moon icon | Theme switches, persisted | HIGH |
| 11.3 | Theme persistence | Switch to light → refresh | Stays on light | MEDIUM |
| 11.4 | Glass cards | View any card | backdrop-filter: blur visible | LOW |
| 11.5 | Chat bubble contrast | View sent/received in both themes | All text readable | HIGH |
| 11.6 | Responsive sidebar | Collapse sidebar (rail mode) | Icons only, still functional | MEDIUM |
| 11.7 | Font | Check any text | Plus Jakarta Sans applied | LOW |

### 12. Infrastructure (Phase 8)

| # | Test Case | Steps | Expected | Priority |
|---|-----------|-------|----------|----------|
| 12.1 | Health endpoint | GET /health | `{"status":"ok","db":"connected"}` | HIGH |
| 12.2 | Container restart | `docker compose restart app` | All services reconnect | HIGH |
| 12.3 | DB backup | Check /backups/ folder | Daily backup files present | MEDIUM |
| 12.4 | SSL | Access https://zalo.ngay.top | Valid SSL (Cloudflare) | HIGH |
| 12.5 | Error resilience | Simulate uncaught error | Process stays alive, logs error | MEDIUM |
| 12.6 | Rate limiting | Send 500+ requests/min | 429 after limit | LOW |

---

## Test Execution Priority

1. **Smoke Test (5 min):** 1.3, 4.2, 5.1, 5.3, 6.1, 10.1, 12.1
2. **Core Flow (15 min):** 2.1-2.2, 4.1-4.3, 5.1-5.5, 6.4-6.8, 9.1-9.6
3. **Full Regression (45 min):** All HIGH + MEDIUM tests
4. **Complete (1.5h):** All tests

## Test Data Needed

- 1+ Zalo account (already connected)
- 2+ test contacts (send messages from Zalo)
- AI provider config (Local LLM at ai.ngay.top)
- 2nd user account (for RBAC testing)

## Automated Testing (Future)

- Backend: Vitest for API endpoint tests
- Frontend: Vitest + Vue Test Utils for component tests
- E2E: Playwright for critical flows
- CI: GitHub Actions pipeline
