---
title: CRM-Med Phase 9-11 — UX Enhancement + Advanced Features + Technical Hardening
status: pending
created: 2026-03-26
type: implementation
---

# CRM-Med Phase 9-11 — Enhancement Plan

## Phase 9: UX Critical (Priority: HIGH, ~5 days)

### 9.1 AI Summary in Chat Sidebar (1 day)
- Add `aiSummary` field to Contact model (or use existing `metadata` JSONB)
- After AI job completes → auto-update contact.metadata.aiSummary with latest classification/tags
- ChatContactPanel: show AI insights section (category, tags, confidence, summary)
- GET /api/v1/contacts/:id/ai-results → fetch latest job results for this contact's conversations

### 9.2 Appointments in Chat Sidebar (1 day)
- ChatContactPanel: add "Lịch hẹn" section below CRM fields
- Fetch contact's appointments via API
- Show upcoming appointments as mini cards
- "Tạo lịch hẹn nhanh" button → inline create form
- After "Đồng bộ lịch" button in chat → refresh sidebar appointments

### 9.3 Notification Center (1.5 days)
- Bell icon in topbar with badge count
- Dropdown panel: lịch hẹn hôm nay/ngày mai, tin nhắn chưa trả lời >30min, Zalo disconnect alerts
- Socket.IO events: `notification:new` → push to frontend
- Store notifications in DB (or in-memory for MVP)

### 9.4 Global Search (1 day)
- Search bar in topbar
- Search across: contacts (name, phone), messages (content), appointments (notes)
- API: GET /api/v1/search?q=keyword
- Results grouped by type with links to detail pages

### 9.5 Mobile Responsive (0.5 day)
- Chat: hide conversation list on mobile, show toggle button
- Sidebar: bottom navigation on mobile
- Tables: horizontal scroll for small screens

## Phase 10: Advanced Features (Priority: MEDIUM, ~7 days)

### 10.1 Quick Reply Templates (2 days)
- DB model: QuickReply { id, orgId, title, content, category, shortcut }
- CRUD API + management page
- In chat input: "/" prefix → show template picker
- Categories: chào hỏi, tư vấn, hẹn lịch, cảm ơn, kê thuốc

### 10.2 Message History Sync (2 days)
- On account connect: call `api.getGroupChatHistory()` for groups
- Call `listener.requestOldMessages()` for user chats
- Store historical messages with `isHistorical: true` flag
- UI: "Tải thêm tin nhắn cũ" button at top of message thread

### 10.3 Contact Auto-assign (1 day)
- Settings: assign rules (round-robin, by source, by team)
- When new contact created from chat → auto-assign to next available user
- Dashboard: show assignment distribution

### 10.4 Contact Merge & Dedup (1 day)
- Detect duplicates by phone number
- API: POST /api/v1/contacts/merge { sourceId, targetId }
- Merge conversations, appointments, messages
- UI: duplicate alert on contact list

### 10.5 Export Functions (1 day)
- Export contacts to Excel with all CRM fields
- Export conversations/messages to Excel
- Export appointment reports
- Bulk download option

## Phase 11: Technical Hardening (Priority: HIGH, ~4 days)

### 11.1 Health Check & Monitoring (1 day)
- Zalo pool health check every 5 minutes
- Socket.IO: emit `zalo:health` with per-account status
- Dashboard widget: Zalo connection status overview
- Alert when account disconnects > 10 minutes

### 11.2 Attachment Storage (1 day)
- Download incoming images/files from Zalo URLs to local storage
- Serve via authenticated `/api/v1/files/*` endpoint
- Zalo URLs expire — local copy ensures persistence
- Cron: cleanup files older than 90 days (configurable)

### 11.3 Rate Limiting Zalo (0.5 day)
- Message queue per account (max 10 msgs/min)
- Warn user when approaching limit
- Log all outgoing messages for audit

### 11.4 Backup Verification (0.5 day)
- Script: test restore from latest backup
- Document restore procedure
- Cron: weekly backup verification

### 11.5 Performance Optimization (1 day)
- Socket.IO: room-based emit instead of broadcast
- DB indexes: message search, conversation listing
- Pagination: cursor-based for message loading
- Frontend: virtual scroll for long message lists

## Timeline

| Phase | Scope | Est. | Priority |
|-------|-------|------|----------|
| 9 | UX Critical | 5 days | HIGH |
| 10 | Advanced | 7 days | MEDIUM |
| 11 | Technical | 4 days | HIGH |
| **Total** | | **~16 days** | |

## Dependencies
- Phase 9.1 depends on AI job data (already working)
- Phase 10.2 depends on zca-js `requestOldMessages()` API
- Phase 11.2 depends on storage decision (local/MinIO)
