# Implementation Report: 6 Features + Anti-Block System

**Date:** 2026-03-27 | **Status:** Deployed at https://zalo.ngay.top

---

## Features Implemented

### 1. Avatar Zalo Display ✅
- Zalo account avatar fetched via `getUserInfo()` on login/reconnect → saved to `ZaloAccount.avatarUrl`
- Contact avatar synced from incoming messages via `updateContactAvatar()`
- Displayed in: ConversationList, MessageThread header, ContactsView table

### 2. Medication Status Options ✅
Added: `'chưa phối hợp khám'`, `'cần tư vấn'` to `MEDICATION_STATUS_OPTIONS`

### 3. Zalo Contact Sync ✅
- **API:** `POST /api/v1/zalo-accounts/:id/sync-contacts`
- Uses `getAllFriends()` zca-js API → upsert contacts (zaloName, avatar, phone)
- Button in Zalo Accounts page per account
- Returns: `{ created, updated, total }`

### 4. Multi-Disease per Contact ✅

**New DB table: `contact_diseases`**

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | PK |
| contactId | FK → Contact | |
| diseaseCode | String | ICD-10 code |
| diseaseName | String | Tên bệnh |
| status | Enum | active / recovering / cured / chronic |
| notes | String? | Ghi chú riêng |
| diagnosedAt | Date? | Ngày phát hiện |
| curedAt | Date? | Ngày khỏi |
| isPrimary | Boolean | Mặt bệnh chính |

**API:** `GET/POST/PUT/DELETE /api/v1/contacts/:id/diseases`

**Frontend:** ChatDiseaseList component trong chat sidebar:
- ICD-10 autocomplete (tìm bằng tên + mã)
- Status chips (đang điều trị=red, hồi phục=orange, đã khỏi=green, mạn tính=purple)
- Add/delete bệnh

### 5. Anti-Block Rate Limiter ✅

**File:** `zalo-rate-limiter.ts`

| Rule | Limit | Action |
|------|-------|--------|
| Daily limit | 200 tin/ngày/account | HTTP 429 + error message |
| Burst detection | Max 5 tin/30 giây | HTTP 429 + error message |
| Per-message tracking | Record every send | Counter + timestamp array |

**Integration:** `chat-routes.ts` → `checkLimits()` before every `sendMessage()` → `recordSend()` after success

**Response khi bị limit:**
```json
{ "error": "Đã đạt giới hạn 200 tin/ngày" }
{ "error": "Gửi quá nhanh (>5 tin/30s)" }
```

### 6. Filter Chat by Zalo Account ✅
- Dropdown filter trong ConversationList: "Tất cả Zalo" hoặc chọn cụ thể
- `accountFilter` ref trong `use-chat.ts` → passed to API `?accountId=`
- Cho phép xem tin nhắn riêng của từng nick nhân viên

---

## Anti-Block Risk Analysis

### Tình huống nguy hiểm đã giải quyết

| # | Tình huống | Rủi ro | Giải pháp đã implement |
|---|-----------|--------|----------------------|
| 1 | Gửi >3 tin < 10s cùng account | 🔴 HIGH | Burst limit: max 5/30s |
| 2 | Nhiều user gửi từ cùng Zalo | 🔴 HIGH | Rate limiter per account (shared) |
| 3 | Gửi >200 tin/ngày | 🟡 MEDIUM | Daily counter + hard block |

### Tình huống CHƯA implement (backlog)

| # | Tình huống | Rủi ro | Giải pháp đề xuất |
|---|-----------|--------|-------------------|
| 4 | Gửi tin giống nhau cho nhiều người | 🔴 HIGH | Duplicate content detection |
| 5 | Gửi tin cho người lạ | 🟡 MEDIUM | Check isFriend trước khi gửi |
| 6 | Content có URL lạ | 🟡 MEDIUM | URL filter/warning |
| 7 | Gửi tin ban đêm (00:00-06:00) | 🟠 LOW | Time window restriction |
| 8 | Gửi file lớn liên tục | 🟠 LOW | File size + frequency limit |
| 9 | Add friend hàng loạt | 🔴 HIGH | Không implement bulk add |
| 10 | Reaction spam | 🟠 LOW | Reaction rate limit |

### Recommendations
1. **Phase tiếp theo:** Implement duplicate content detection (item 4) — rủi ro cao nhất còn lại
2. **Monitor:** Track daily send counts per account → alert khi > 150/ngày
3. **Zalo behavior:** Không gửi quá 3 tin liên tiếp cho cùng 1 người mà không có phản hồi
4. **Human delay:** Thêm random delay 1-5s giữa các tin để simulate typing tự nhiên

---

## Files Changed

**Backend (6 files):**
- `zalo-pool.ts` — avatar fetch on login
- `zalo-sync-routes.ts` — NEW: sync contacts API
- `zalo-rate-limiter.ts` — NEW: rate limiter
- `contact-disease-routes.ts` — NEW: multi-disease CRUD
- `chat-routes.ts` — rate limit integration
- `schema.prisma` — ContactDisease model

**Frontend (8 files):**
- `use-contacts.ts` — 2 new status options
- `ContactsView.vue` — avatar column
- `ZaloAccountsView.vue` — sync contacts button
- `ChatDiseaseList.vue` — NEW: disease management
- `ChatContactPanel.vue` — refactored, added disease list
- `ConversationList.vue` — account filter dropdown
- `use-chat.ts` — accountFilter ref
- `ChatView.vue` — filter account handler
