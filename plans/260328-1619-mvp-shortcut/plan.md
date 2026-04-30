---
title: CRM-Med MVP Shortcut — Public Release
status: pending
created: 2026-03-28
type: implementation
---

# CRM-Med MVP Shortcut — Public GitHub Release

## Objective

Tạo phiên bản **MVP đơn giản, general-purpose** từ CRM-Med hiện tại. Strip domain-specific (y tế) features, remove private data, thêm API/Webhook. Push lên GitHub public.

## What stays vs What goes

| Feature | MVP | Reason |
|---------|-----|--------|
| Multi-Zalo account management | ✅ KEEP | Core feature |
| QR login + session persistence | ✅ KEEP | Core |
| Real-time chat (send/receive) | ✅ KEEP | Core |
| Contact/Customer CRM | ✅ KEEP (rename "Khách hàng") | Core |
| Group + User chat | ✅ KEEP | Core |
| Appointments/Scheduling | ✅ KEEP (generic "Lịch hẹn") | Useful |
| Dashboard + KPI | ✅ KEEP | Useful |
| Reports + Excel export | ✅ KEEP | Useful |
| User management + RBAC | ✅ KEEP | Core |
| Team management | ✅ KEEP | Useful |
| Notifications | ✅ KEEP | UX |
| Global search | ✅ KEEP | UX |
| Rate limiter | ✅ KEEP | Safety |
| Auto-reconnect + circuit breaker | ✅ KEEP | Reliability |
| Liquid Silicon theme | ✅ KEEP | Branding |
| **API + Webhook** | ✅ ADD | New |
| ICD-10 codes | ❌ REMOVE | Domain-specific |
| Disease tracking (ContactDisease) | ❌ REMOVE | Domain-specific |
| Patient directory (merge) | ❌ REMOVE | Domain-specific |
| AI analysis (jobs, providers) | ❌ REMOVE | Complexity |
| AI settings page | ❌ REMOVE | Complexity |
| Patient report (new/returning) | ❌ REMOVE | Domain-specific |
| .env secrets, API keys | ❌ REMOVE/SANITIZE | Security |

## Phases

### Phase 1: Fork & Strip (1 day)

**Goal:** Create clean branch `mvp`, remove domain-specific code.

#### 1.1 Create branch
```bash
git checkout -b mvp
```

#### 1.2 Backend removals
- DELETE: `backend/src/modules/jobs/` (entire AI system)
- DELETE: `backend/src/modules/patients/` (patient directory)
- DELETE: `backend/src/modules/contacts/icd10-data.ts`
- DELETE: `backend/src/modules/contacts/icd10-routes.ts`
- DELETE: `backend/src/modules/contacts/contact-disease-routes.ts`
- DELETE: `backend/src/modules/chat/appointment-sync.ts` (Zalo reminder → appointment)
- MODIFY: `contact-routes.ts` — remove diseaseCode, diseaseName, treatmentProgress, medicationStatus fields
- MODIFY: `app.ts` — remove all deleted route registrations
- MODIFY: `prisma/schema.prisma` — remove ICD10, ContactDisease, Patient, Job, JobRun, JobResult models
- MODIFY: `prisma/schema.prisma` — simplify Contact model (remove disease fields)
- KEEP: Contact with: id, orgId, zaloUid, phone, fullName, avatarUrl, source, firstContactDate, nextAppointment, assignedUserId, notes, tags, metadata

#### 1.3 Frontend removals
- DELETE: `views/Icd10ManagementView.vue`
- DELETE: `views/AISettingsView.vue`
- DELETE: `views/JobsView.vue`
- DELETE: `views/JobDetailView.vue`
- DELETE: `views/PatientsView.vue`
- DELETE: `components/chat/ChatDiseaseList.vue`
- DELETE: `components/chat/ChatAiInsights.vue`
- DELETE: `components/patients/PatientDetailDialog.vue`
- DELETE: `composables/use-jobs.ts`
- DELETE: `composables/use-ai-settings.ts`
- MODIFY: `router/index.ts` — remove deleted routes
- MODIFY: `DefaultLayout.vue` — remove deleted menu items
- MODIFY: `ChatContactPanel.vue` — remove disease list, AI insights
- MODIFY: `ContactDetailDialog.vue` — remove disease fields
- MODIFY: `ContactsView.vue` — remove disease columns
- MODIFY: `DashboardView.vue` — remove patient report card

#### 1.4 Sanitize
- DELETE: `.env` file
- UPDATE: `.env.example` — ensure no real values, only placeholders
- DELETE: `prisma/seed.ts` (ICD-10 seed)
- DELETE: `backups/` directory contents
- UPDATE: `.gitignore` — ensure .env, backups, node_modules excluded
- Review all files for hardcoded URLs (ngay.top, ai.ngay.top) → replace with placeholders

### Phase 2: Add API + Webhook System (1 day)

#### 2.1 Public API endpoints

Create `backend/src/modules/api/public-api-routes.ts`:

REST API with API key auth (not JWT — for external integrations):

```
# Auth: Header "X-API-Key: <key>"

GET    /api/public/contacts              → list contacts
GET    /api/public/contacts/:id          → contact detail
POST   /api/public/contacts              → create contact
PUT    /api/public/contacts/:id          → update contact

GET    /api/public/conversations          → list conversations
GET    /api/public/conversations/:id/messages → messages

GET    /api/public/appointments           → list appointments
POST   /api/public/appointments           → create appointment

POST   /api/public/messages/send          → send message { accountId, threadId, content }
```

API key stored in AppSetting table (per org). Generate via Settings page.

#### 2.2 Webhook system

Create `backend/src/modules/api/webhook-service.ts`:

Events:
- `message.received` — new incoming message
- `message.sent` — outgoing message
- `contact.created` — new contact auto-created
- `appointment.created` — new appointment
- `zalo.connected` — account connected
- `zalo.disconnected` — account disconnected

Webhook URL configured per org in Settings:
```
POST /api/v1/settings/webhook  { url, secret, events[] }
GET  /api/v1/settings/webhook  → current config
```

When event fires → POST to webhook URL with:
```json
{
  "event": "message.received",
  "timestamp": "2026-03-28T12:00:00Z",
  "data": { ... },
  "signature": "hmac-sha256(secret, body)"
}
```

#### 2.3 Settings page — API & Webhook

Replace AI Settings page with API/Webhook settings:
- Generate/regenerate API key
- Webhook URL input
- Event checkboxes
- Test webhook button
- API documentation link

### Phase 3: Rebrand & Polish (0.5 day)

#### 3.1 Rename
- "CRM-Med" → "ZaloCRM" or keep "CRM-Med" (generic enough)
- Remove medical terminology from UI labels
- "Bệnh nhân" → "Khách hàng" everywhere
- "Mặt bệnh" → removed
- "Tiến triển điều trị" → removed
- "Trạng thái thuốc" → "Trạng thái" (generic pipeline)
- "Tái khám" → "Hẹn gặp"

#### 3.2 Contact fields (simplified)

| Field | Label | Type |
|-------|-------|------|
| fullName | Họ tên | text |
| phone | SĐT | text |
| email | Email | text (ADD) |
| source | Nguồn | select: FB/TT/GT/CN/Zalo/Web |
| status | Trạng thái | select: new/contacted/interested/converted/lost |
| firstContactDate | Ngày tiếp nhận | date |
| nextAppointment | Hẹn tiếp theo | date |
| assignedUserId | Phụ trách | select (user list) |
| notes | Ghi chú | textarea |
| tags | Tags | combobox |

#### 3.3 Write README.md for public repo

```markdown
# ZaloCRM — Multi-Account Zalo Management

Manage multiple personal Zalo accounts from one web dashboard.
Real-time chat, customer CRM, appointments, reports.

## Features
- Multi-Zalo account (QR login, auto-reconnect)
- Real-time chat (user + group)
- Customer CRM with pipeline
- Appointment scheduling
- Dashboard + Reports (Excel export)
- Team management + RBAC
- REST API + Webhooks
- Liquid Silicon UI (dark/light theme)

## Quick Start
...docker compose up...

## API Documentation
...

## Tech Stack
Node.js, Fastify, Vue 3, Vuetify, PostgreSQL, Socket.IO, zca-js
```

### Phase 4: Test & Push (0.5 day)

#### 4.1 Clean build test
```bash
cd backend && npx tsc --noEmit
cd frontend && npx vue-tsc -b --noEmit && npm run build
docker compose up -d --build
```

#### 4.2 Smoke test — all remaining endpoints
#### 4.3 Push to GitHub public repo

```bash
git remote add public https://github.com/vuongnguyenbinh/ZaloCRM.git
git push public mvp:main
```

## Timeline

| Phase | Scope | Est. |
|-------|-------|------|
| 1 | Fork & Strip | 1 day |
| 2 | API + Webhook | 1 day |
| 3 | Rebrand & Polish | 0.5 day |
| 4 | Test & Push | 0.5 day |
| **Total** | | **3 days** |

## Risks

| Risk | Mitigation |
|------|-----------|
| Breaking imports after deletion | `tsc --noEmit` after each deletion batch |
| Orphan DB columns | `prisma db push` regenerates schema |
| Hardcoded medical terms | Global search + replace |
| Leaked secrets in git history | New repo (not fork) — fresh git init |

## Key Decision: New repo vs Branch

**Recommended: New repo** (fresh `git init`).
- Private CRM-Med repo keeps full history + medical features
- Public ZaloCRM repo starts clean — no secret/key in history
- Both repos can coexist: CRM-Med for phòng khám, ZaloCRM for community
