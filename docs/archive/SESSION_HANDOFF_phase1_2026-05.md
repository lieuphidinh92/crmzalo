# SESSION HANDOFF — ngheduocsi.vn B2B CRM

**Repo:** `/Users/tranhien1897/Desktop/zalo-crm/CRM-Med-main/`
**Branch:** `main`
**Last commit:** `6de01a3` (Phase 1 milestone)
**Stack:** Vue 3 + Vuetify (frontend) · Fastify + Prisma 7 + Postgres 16 (backend) · zca-js (Zalo) · Claude/Gemini/local LLM (AI)

> Memory bridge between this session and the next. Read top-to-bottom on
> first context load; sections are independent for jump-back lookups.

---

## Table of contents
1. [Quick start](#1-quick-start) — get the dev env running
2. [Session-1 work — what shipped](#2-session-1-work--what-shipped)
3. [Module file structure](#3-module-file-structure) — where things live
4. [API endpoints](#4-api-endpoints) — full surface
5. [Patterns & conventions](#5-patterns--conventions) — DON'T re-derive
6. [Phase 2 deferred work](#6-phase-2-deferred-work)
7. [Tech debt flagged but not fixed](#7-tech-debt-flagged-but-not-fixed)
8. [TODO for the next session](#8-todo-for-the-next-session)

---

## 1. Quick start

```bash
cd /Users/tranhien1897/Desktop/zalo-crm/CRM-Med-main

# Postgres should be running locally (Homebrew)
brew services start postgresql@16

# Backend
cd backend && npm install --legacy-peer-deps
npx prisma db push --url 'postgresql://crmuser:devpassword@localhost:5432/zalocrm'
npx prisma generate
npm run dev          # → http://localhost:3000

# Frontend (separate terminal)
cd ../frontend && npm install --legacy-peer-deps
npm run dev          # → http://localhost:5173

# First-time setup (only once after fresh DB)
curl -X POST http://localhost:3000/api/v1/setup \
  -H "Content-Type: application/json" \
  -d '{"orgName":"Sỉ TPCN","fullName":"Admin","email":"admin@local.dev","password":"Admin@123"}'
```

**Login:** `admin@local.dev` / `Admin@123`

**Preview tools:**
- Backend uses `.env` symlinked from `CRM-Med-main/.env` to `backend/.env`.
- Backend `dev` script has `tsx watch --env-file=.env src/app.ts` (loads env automatically).
- Frontend Vite proxy: `/api` → backend:3000, `/socket.io` → backend:3000.

---

## 2. Session-1 work — what shipped

Listed roughly in build order. Every item is committed in `fcdc514` (initial dump + first ~9 modules) or `413aca0` (Tasks Phase 1) and marked complete by milestone `6de01a3`.

### 2.1 Branding & PWA (foundational)
- **Theme tokens** in `frontend/src/assets/main.css` — Deep Navy `#0A1628` + Amber `#F59E0B` palette, font Inter + Lora slogan.
- **`<BrandLogo>`** with 3 variants: `icon` / `horizontal` / `stacked` — used in topbar, login, splash, favicon.
- **PWA**: `vite-plugin-pwa`, manifest, 8 icons (72→512) + iPhone splash 1170×2532, navigateFallback, `runtimeCaching` for API + fonts. Installable; Lighthouse PWA score = 100.
- **Mobile**: `BottomNav.vue` + `MobileHeader.vue` + `mobile.css` (safe-area, 100dvh, touch ≥44px, no iOS zoom).

### 2.2 Customer module B2B redesign
- **17 new Contact fields**: storeName, province, customerType, scale, currentProducts (Json), currentSupplier, monthlyRevenueEstimate, avgOrderQuantity, stage, stuckReason, policyTier, debtAmount, lastOrderDate, nextContactDate, internalNote, rewardPoints, aiInsight (Json), aiInsightUpdatedAt, potentialValue, stageUpdatedAt, birthday.
- **AI Insight slide-over** (`ContactInsightPanel.vue`) — Claude analyses Zalo chat history; incremental analysis (uses `aiInsightUpdatedAt` as cursor); 7 structured fields (summary / pain_points / buying_signals / objections / recommended_actions / best_time_to_contact / relationship_temperature).
- **Column picker** (`ContactColumnPicker.vue`) with localStorage `crm_column_prefs_${userId}` per-user persistence.
- **SĐT clickable** → opens Zalo chat via `/contacts/:id/conversations` deeplink to `/chat?conversationId=...`.

### 2.3 Cleanup legacy medical
- Dropped 5 fields: diseaseCode, diseaseName, treatmentProgress, medicationStatus, nextAppointment.
- Dropped 3 models: Patient, ContactDisease, Icd10Code.
- Removed routes `/patients`, `/icd10-management` and all related views.
- ChatContactPanel + ChatDiseaseList cleaned. ReportsView "Bệnh lý" tab removed.

### 2.4 Quick Reply Bar (chat)
- 5 admin-configurable templates (welcome / pricing / reward / legal / media).
- `QuickReplyBar.vue` chip strip above chat input.
- Admin config at `/quick-replies` (admin/owner only menu).
- Send via dedicated endpoint that handles text / link / image / combined types and falls back to URL-as-text on attachment failure.

### 2.5 Báo cáo Resale (`/reports/resale`)
- 6 KPI cards (active agents / at-risk / churned / month revenue / avg interval / AOV).
- 6-segment table (Vừa đặt → Đã churn) click-to-drill.
- Top 10 agents by YTD revenue.
- 12-week line chart + type-share doughnut.
- Drill-in `/reports/resale/at-risk?segment=...` with Zalo + Insight buttons per row.
- 5-minute in-memory cache.

### 2.6 Pipeline cơ hội (`/reports/pipeline`)
- 5-stage Kanban with `vue-draggable-plus` drag-drop.
- StageHistory audit log (insert on every stage change).
- Member-only-own-deals permission (frontend rollback + backend 403).
- "Hỏi lý do" dialog when dropping into "Ngừng" stage.
- 4 KPI metrics + Top stuck reasons.

### 2.7 Dashboard CEO (`/dashboard/ceo`) — admin/owner only
- 6 hero KPI (month revenue / YTD vs goal / agents active/total / new closed / churn / pipeline value).
- Pareto Bar+Line combo chart with 80% threshold line + Top 20 table.
- Cohort retention 12×13 heatmap (cohort by first-close month).
- Stacked bar revenue by customer type (12 months).
- VIP at-risk red card with "Báo Sale chăm ngay" → ActivityLog entry.
- "Xuất PDF" via `window.print()` + `@media print` CSS (force light, page breaks).

### 2.8 Sale Evaluation module (inside CEO Dashboard)
- 7 metrics calculated per (sale, calendar month):
  resaleRevenue / activeRate / newAgents / conversionRate / retention90d / complianceScore (0-100 composite of 4 sub-metrics).
- Composite score: `Σ (metric_normalized_against_month_max × weight%)`.
- Top-3 podium (gold center, silver left, bronze right).
- Detail slide-over: radar (Chart.js), 6-month score history, top 5 agents, top 3 stuck deals, feedback textarea.
- Tunable weight modal (6 sliders, sum=100% validation, live re-rank preview).
- 5 alert categories: 🚨 ép hàng / 🚨 bỏ bê / 🚨 sắp nghỉ / 💎 tiềm năng (3-month-trend deferred).
- Compliance hooks auto-log: note_updated, stage_updated, zalo_replied (with responseSeconds), ai_insight_used.

### 2.9 Settings (`/ai-settings` — renamed "Cấu hình")
- Rewrote to 2 tabs: AI provider config + Mục tiêu kinh doanh.
- 4 thresholds tunable: stuckDays / atRiskDays / churnDays / annualRevenue.
- Cross-validation: atRiskDays < churnDays.
- Resale + Pipeline + CEO services all read goals from `getOrgGoals(orgId)` with 60s cache.

### 2.10 Dashboard redesign (`/`)
- Role-switching: owner/admin → `<AdminDashboard>` (Tổng quan điều hành); member → `<PersonalDashboard>` (Trang làm việc cá nhân).
- Toggle "Xem theo góc nhìn Sale" for owner/admin.
- 5 personal endpoints + 5 admin endpoints, all parallel-fetched via `Promise.all`.
- Personal: today appointments + due reminders + my-at-risk + 4 KPI + mini-pipeline + quick actions.
- Admin: 4 hero KPI (with sparkline) + 3 critical-alert cards + 12-month revenue trend (toggle by total/type/source) + 2-col panels + quick links.

### 2.11 Việc cần làm (Tasks) Phase 1 (`/tasks`)
- Replaces "Lịch hẹn" sidebar item; `/appointments` redirects to `/tasks`.
- 6 new tables: TaskCategory (10 canonical) + Task + RecurringTaskRule + AutoTaskRule + LearningModule + LearningProgress.
- 8 seeded recurring rules + 5 seeded auto rules per org (idempotent, runs on first /tasks GET).
- 3 cron jobs (TZ=Asia/Ho_Chi_Minh): 00:01 daily generator, 15min auto trigger, 15min notification stub.
- 3-column TasksView: filter & stats / grouped task list (collapsible) / detail panel.
- Category-specific completion fields (post link / lead result / interact type).
- Personal Dashboard rewired: TodayTasksList + WeeklyCadence + RemindersList (preserved from old).

### 2.12 Git
- 3 commits on `main`:
  - `fcdc514` Initial commit (full pre-Phase-1 codebase, 241 files, 43,397 lines)
  - `413aca0` Tasks Phase 1 (20 files)
  - `6de01a3` Phase 1 milestone (empty)

---

## 3. Module file structure

```
backend/src/modules/
├── auth/                           # JWT + roles + user/team/org CRUD
├── chat/                           # conversations, messages, handler
├── contacts/
│   ├── contact-routes.ts           # CRUD + filter + PATCH /:id/stage
│   ├── contact-ai-insight-routes.ts # POST /:id/ai-insight + /:id/conversations
│   ├── contact-sub-resource-routes.ts
│   ├── appointment-routes.ts       # ⚠ legacy — table kept, menu hidden
│   ├── appointment-reminder.ts
│   └── appointment-sync.ts
├── dashboard/
│   ├── ceo-routes.ts + ceo-service.ts            # 6 endpoints, 15min cache
│   ├── sale-performance-routes.ts + service.ts   # 7 metrics + scoring + alerts
│   ├── personal-dashboard-routes.ts + service.ts # 5 endpoints, member-scoped
│   ├── admin-dashboard-routes.ts + service.ts    # 5 endpoints, admin-only
│   ├── dashboard-routes.ts                        # legacy KPI/sources/pipeline (still wired)
│   └── report-routes.ts                           # /reports/* legacy CRM reports
├── jobs/                           # AI jobs scheduler + Claude/Gemini providers
├── notifications/                  # on-the-fly computed; no persistent table
├── orders/                         # Order CRUD + stats
├── quick-replies/                  # quick-reply-routes + service
├── reports/
│   ├── resale-routes.ts + service.ts   # 5min cache, withCache helper here
│   └── pipeline-routes.ts + service.ts # share resale's cache
├── search/                         # global search-routes
├── settings/
│   ├── business-goals-service.ts + routes.ts        # 4 thresholds
│   └── sale-score-config-service.ts + routes.ts     # 6 weights, sum=100
├── tasks/                          # ★ NEW Phase 1
│   ├── task-seeds.ts               # 10 categories + 8 recurring + 5 auto
│   ├── task-service.ts             # CRUD + stats + cadence
│   ├── task-cron.ts                # 3 jobs (00:01 / 15min / 15min)
│   └── task-routes.ts              # 11 endpoints + 2 admin debug
└── zalo/                           # zca-js pool + listener + rate-limiter

backend/src/shared/
├── database/prisma-client.ts       # Prisma 7 ESM workaround
└── utils/
    ├── compliance-logger.ts        # logCompliance() helper
    └── logger.ts


frontend/src/
├── api/index.ts                    # axios instance, baseURL=/api/v1, JWT interceptor
├── components/
│   ├── BrandLogo.vue
│   ├── BottomNav.vue + MobileHeader.vue + OfflineSnackbar.vue
│   ├── GlobalSearch.vue + NotificationBell.vue
│   ├── ceo/                        # 8 components (Hero/Pareto/Cohort/Segment/AtRiskVips/SalePerf*)
│   ├── chat/                       # ConversationList, MessageThread, ChatContactPanel, QuickReplyBar
│   ├── contacts/                   # ContactFilters, ContactDetailDialog, ContactInsightPanel, ContactColumnPicker
│   ├── dashboard/                  # legacy: KpiCards, MessageVolumeChart, PipelineChart, SourceChart, AppointmentChart (UNUSED — kept for safety)
│   ├── home/
│   │   ├── PersonalDashboard.vue
│   │   ├── AdminDashboard.vue
│   │   ├── personal/               # TodayTasksList ★, WeeklyCadence ★, RemindersList ★, MyKpiRow, MyAtRiskAgents, MyMiniPipeline, QuickActions, QuickNoteDialog
│   │   │                           # also TodayTasks.vue (LEGACY, replaced by TodayTasksList)
│   │   └── admin/                  # AdminHeroKpi, Sparkline, AdminCriticalAlerts, AdminRevenueTrend, AdminTwoColPanels, AdminQuickLinks
│   ├── pipeline/                   # PipelineFunnel, PipelineDealCard, PipelineMetricRow, PipelineStuckReasons
│   ├── reports/                    # ResaleKpiCards, ResaleSegmentsTable, ResaleTopAgents, ResaleWeeklyChart, ResaleTypeShareChart
│   └── tasks/                      # ★ NEW: TaskCard, TaskDoneDialog, TaskSnoozeDialog, TaskSkipDialog, AddTaskDialog
├── composables/
│   ├── use-tasks.ts ★              # filters, list, done/snooze/skip/create
│   ├── use-cadence-progress.ts ★   # 4-row weekly widget
│   ├── use-personal-dashboard.ts
│   ├── use-admin-dashboard.ts
│   ├── use-ceo-dashboard.ts
│   ├── use-sale-performance.ts + use-sale-score-config.ts
│   ├── use-pipeline.ts + use-resale-report.ts
│   ├── use-business-goals.ts + use-quick-replies.ts
│   ├── use-contacts.ts + use-chat.ts + use-chat-contact-panel.ts + ...
│   └── use-online-status.ts
├── views/
│   ├── DashboardView.vue           # role-switching wrapper (NOT KpiCards anymore)
│   ├── TasksView.vue ★             # 3-column task center
│   ├── ContactsView.vue + ChatView.vue + OrdersView.vue + ZaloAccountsView.vue
│   ├── CeoDashboardView.vue + ResaleReportView.vue + ResaleAtRiskView.vue + PipelineView.vue
│   ├── ReportsView.vue (legacy 3-tab) + AISettingsView.vue (now 2-tab "Cấu hình")
│   ├── QuickRepliesView.vue + JobsView.vue + JobDetailView.vue
│   ├── SettingsView.vue (Nhân viên CRUD) + LoginView.vue + SetupView.vue
│   ├── MoreView.vue (mobile bottom-nav menu) + NotFoundView.vue
│   └── AppointmentsView.vue ⚠ legacy — file kept, route redirects to /tasks
├── layouts/DefaultLayout.vue       # sidebar + topbar + mobile header
├── plugins/vuetify.ts              # theme tokens
├── router/index.ts
└── stores/auth.ts                  # Pinia, login/logout/user

backend/prisma/schema.prisma        # 24 models
```

★ = new in Tasks Phase 1.
⚠ = legacy kept for safety; do NOT reuse without checking.

---

## 4. API endpoints

All routes mounted under `/api/v1/`. JWT required everywhere except `/setup`, `/setup/status`, `/auth/login`, `/health`. Admin/owner-only routes marked **(admin)**.

### Auth & users
- `GET /setup/status` → `{ needsSetup }`
- `POST /setup` body `{ orgName, fullName, email, password }`
- `POST /auth/login` body `{ email, password }` → `{ token, user }`
- `GET /profile` (auth)
- `GET /users`, `POST /users`, `PUT /users/:id`, `PUT /users/:id/password`, `DELETE /users/:id` (admin)
- Team / Org CRUD

### Contacts
- `GET /contacts` query: page, limit, search, source, customerType, stage, policyTier, province, scale, assignedUserId
- `GET /contacts/pipeline` (rekeyed by stage)
- `GET /contacts/:id`
- `POST /contacts` / `PUT /contacts/:id` / `DELETE /contacts/:id`
- `PATCH /contacts/:id/stage` body `{ newStage, reason? }` — drag-drop endpoint, member can only mutate own contacts; logs StageHistory + bust caches + compliance hook
- `PUT /contacts/:id/tags`
- `GET /contacts/:id/conversations` — deeplink helper
- `POST /contacts/:id/ai-insight` body `{ reset? }` — incremental Claude analysis

### Chat / Zalo
- `GET /conversations` query: page, limit, search, accountId
- `GET /conversations/:id` / `GET /conversations/:id/messages`
- `POST /conversations/:id/messages` body `{ content }` — rate-limited, compliance-logged
- `POST /conversations/:id/quick-reply` body `{ key }` — sends template
- `POST /conversations/:id/mark-read`
- `GET /quick-replies` / `PUT /quick-replies/:key` (admin)
- Zalo accounts CRUD + `/zalo-accounts/:id/login` + `/reconnect` + `/status`

### Reports
- **Resale** (`/reports/resale/`)
  - `overview?from=&to=&sale_id=&type=` → 6 KPI + 12-week + type share
  - `segments?...` → 6-segment table
  - `top-agents?...&limit=`
  - `at-risk-agents?segment=...`
- **Pipeline**
  - `GET /pipeline?sale_id=&from=&to=` → 5 columns of cards (member auto-scoped)
  - `GET /pipeline/conversion-stats` → 4 metrics
  - `GET /pipeline/stuck-reasons`
- **CEO Dashboard** (admin/owner only)
  - `GET /dashboard/ceo/kpi` (15min cache)
  - `GET /dashboard/ceo/pareto`
  - `GET /dashboard/ceo/cohort-retention`
  - `GET /dashboard/ceo/revenue-by-segment`
  - `GET /dashboard/ceo/at-risk-vips`
  - `POST /dashboard/ceo/notify-sale` body `{ contactId, saleUserId, message? }`
- **Sale Performance**
  - `GET /dashboard/ceo/sale-performance?month=YYYY-MM` (member sees only own row)
  - `GET /dashboard/ceo/sale-performance/:saleId/detail?month=`
  - `GET /dashboard/ceo/sale-performance/alerts` (admin only)
  - `POST /dashboard/ceo/sale-performance/:saleId/feedback`
- **Reports legacy** (still wired)
  - `GET /reports/messages` / `/reports/contacts` / `/reports/appointments` / `/reports/export`
- **Personal Dashboard** (`/dashboard/personal/`)
  - `today-tasks` (appointments + reminders)
  - `at-risk-agents`, `kpi`, `mini-pipeline`, `quick-action-badges`
- **Admin Dashboard** (`/dashboard/admin/`, admin-only)
  - `hero-kpi` (incl. 7-day sparkline)
  - `critical-alerts` (3 categories)
  - `revenue-trend?groupBy=total|type|source`
  - `recent-new-agents`, `top-sales`

### Tasks ★ Phase 1 NEW
- `GET /task-categories` (auto-seeds)
- `GET /tasks?period=today|week|month|all&category=&status=&source=`
- `GET /tasks/today` (top 5)
- `GET /tasks/cadence-progress` (4 rows)
- `GET /tasks/:id`
- `POST /tasks`
- `PUT /tasks/:id/done` body `{ completionNote, metadataPatch }`
- `PUT /tasks/:id/snooze` body `{ newDue, newTime? }`
- `PUT /tasks/:id/skip` body `{ reason }`
- `GET /recurring-task-rules` / `PUT /recurring-task-rules/:id` (admin)
- `GET /auto-task-rules` / `PUT /auto-task-rules/:id` (admin)
- `POST /tasks/_run-generator` (admin debug — fires cron 1)
- `POST /tasks/_run-auto` (admin debug — fires cron 2)

### Settings
- `GET /settings/business-goals` / `PUT` (admin)
- `GET /sale-score-config` / `PUT` / `POST /sale-score-config/reset` (admin)

### Misc
- `GET /search?q=` (global search)
- `GET /notifications` (computed on-the-fly)
- `GET /icd10` ❌ removed in cleanup
- `GET /patients` ❌ removed in cleanup

---

## 5. Patterns & conventions

**These are non-negotiable for the next session — do NOT re-derive.**

### 5.1 Stack identity
- Frontend is **Vue 3 + Vuetify**, NOT React. Spec docs sometimes say "React/TSX" — convert mentally to `<script setup lang="ts">` + Vue SFC. `defineProps`, `defineEmits`, `computed`, `ref`, `reactive`, `withDefaults`, `useRouter`, `useRoute`, Pinia store via `useAuthStore`.
- Backend is **Fastify** with `prisma` 7 + ESM. **Prisma 7 quirk**: `import pkg from '@prisma/client'; const { PrismaClient, Prisma } = pkg;` (named ESM import doesn't work — see `backend/src/shared/database/prisma-client.ts`).
- Charts: **Chart.js + vue-chartjs**, register required elements per chart type.
- Drag-drop: **vue-draggable-plus** (installed `--legacy-peer-deps` because Vue 3.5).

### 5.2 Auth & permissions
```typescript
// Every route file:
app.addHook('preHandler', authMiddleware);
// Then per-route:
{ preHandler: requireRole('owner', 'admin') }
// Member-scoped queries: filter by request.user.id
// Roles: owner | admin | member.   No leader role exists.
```
Frontend menu gate: `{ ..., adminOnly: true }` flag in `allMenuItems` filters via `menuItems` computed.

### 5.3 Theme tokens (`assets/main.css`)
```css
--brand-navy-900: #0A1628;  /* page bg */
--brand-navy-800: #0F1E36;  /* cards/sidebars */
--brand-navy-700: #162844;  /* surfaces */
--brand-navy-600: #1E3458;  /* hover/active borders */
--brand-amber-500: #F59E0B; /* primary accent */
--text-primary: #FFFFFF;
--text-secondary: #B8C5D6;
--text-muted: #7A8AA0;
```

### 5.4 In-memory cache pattern
Used by Resale (5min), CEO Dashboard (15min), Goals (60s), ScoreConfig (60s):
```typescript
const cache = new Map<string, { data: unknown; expiresAt: number }>();
const TTL_MS = 5 * 60 * 1000;
export function cacheKey(parts: Array<string | undefined | null>): string { ... }
export async function withCache<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data as T;
  const data = await loader();
  cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
  return data;
}
export function invalidateCacheByPrefix(prefix: string): void {
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
}
```
Resale's exported `withCache` is reused by Pipeline so they share one Map.
Cache busts: drag-drop stage change calls `invalidateCacheByPrefix('pipeline-deals|' + orgId)` etc. for 6 prefixes.

### 5.5 Compliance logger
```typescript
import { logCompliance } from '../../shared/utils/compliance-logger.js';
// Fire-and-forget — never throws, never blocks caller:
logCompliance({
  orgId: user.orgId,
  saleId: contact.assignedUserId,  // who owns the deal, NOT who clicked
  actionType: 'note_updated',       // | stage_updated | zalo_replied | ai_insight_used
  contactId,
  metadata: { editedBy: user.id, ... },
});
```
Hooked at: contact-routes (PUT note + PATCH stage) · chat-routes (send message, with responseSeconds) · contact-ai-insight-routes.

### 5.6 Goals threshold pattern
```typescript
const goals = await getOrgGoals(orgId);
// goals.stuckDays, goals.atRiskDays, goals.churnDays, goals.annualRevenue
// Used by resale-service, pipeline-service, ceo-service, sale-performance-service.
// Cache 60s; mutated via PUT /settings/business-goals.
```

### 5.7 Idempotent seed-on-first-use
Tasks use this. Categories are global (no orgId), rules are per-org:
```typescript
app.addHook('preHandler', async (request) => {
  if (!request.user?.orgId) return;
  if (!request.url.startsWith('/api/v1/tasks')) return;
  await ensureRulesSeededForOrg(request.user.orgId);
});
```

### 5.8 Frontend formatters (consistent)
```typescript
formatVNDShort(n)  // → "1.5 tỷ" / "120 tr" / "5k" / "500"
formatVNDFull(n)   // → "1.500.000.000 ₫"
customerTypeLabel(t)  // nha_thuoc → "Nhà thuốc"
```
Each composable that needs them re-exports its own. Don't centralise yet (each module owns its types).

### 5.9 Mobile responsiveness
- Vuetify `useDisplay()` provides `mobile`, `smAndDown`, etc.
- BottomNav appears for `display.mobile.value === true`.
- Most grids use `cols="12" md="6"` so they stack automatically.
- Special-case for Pipeline: drag-drop disabled on touch (vue-draggable-plus handles it).

### 5.10 Workflow protocol — audit before code
Every multi-file task in this session followed this:
1. **Audit** existing files with the Explore agent or targeted reads.
2. **Flag 3-5 design decisions** with recommended choice + rationale.
3. Wait for user "tất cả theo recommend" or specific overrides.
4. **Execute** systematically with TodoWrite checkpoints.
5. **Smoke-test endpoints** with `curl` after backend changes.
6. **Verify in browser** via preview screenshots after frontend changes.

Skipping the audit step on big tasks led to scope creep / wasted work earlier — keep it.

### 5.11 Prisma model naming
- Tables `@@map("snake_case")`
- Fields `@map("snake_case")` for db column, camelCase in TS.
- Composite uniques: `@@unique([orgA, fieldB])` — referenced in upsert as `where: { orgA_fieldB: { ... } }`.
- For `Date`-only columns use `@db.Date`; for `DateTime` default `@db.Timestamp(3)`.

---

## 6. Phase 2 deferred work

Items explicitly deferred during Tasks Phase 1 + Personal Dashboard work:

### 6.1 Tasks module Phase 2
- **`/tasks/learning` page**: LearningModule + LearningProgress tables already exist. Need view that shows required vs optional modules, status, score, "Bắt đầu học" button → opens contentUrl. Admin sub-page to CRUD modules.
- **`/settings/cadence` admin config**: UI to toggle recurring rules, edit cron expressions, edit message templates, edit weekly targets per role. Admin/owner only. Reuse `useRecurringTaskRules` + `useAutoTaskRules` composables.
- **Compliance score refactor**: change `sale-performance-service.calculateComplianceScore` from 30/30/25/15 (note/stage/zalo/aiInsight) to **25/25/20/15/15** (today_completion / weekly_cadence / zalo / note / stage). Pull `today_completion` from `getCadenceProgress` per user. This breaks existing month-comparison data continuity — flag to user before changing.
- **WebSocket realtime push** for tasks: `runNotificationReminder` cron stub is in place; need to (a) fix Socket.IO JWT auth first (see Tech Debt 7.1), (b) persist Notification table or emit ephemeral, (c) add audio "ding" toggle in user prefs.
- **Confetti animation** when ticking task done (consider bundle weight; CSS-only is fine, library is overkill).

### 6.2 Other deferred from earlier phases
- **Lighthouse audit on prod build**: build with `npm run build` then run `lighthouse@11` (PWA category dropped in v12). Last run = 100 PWA / 92 a11y / 100 best-practices / 83 SEO / 63 perf.
- **Bundle optimisation**: Vite vendor chunk splitting done (vendor-vuetify 162KB gz, vendor-charts 89KB gz). Could go further with Vuetify treeshaking via `import { VBtn } from 'vuetify/components'` patterns — drops ~30-50% Vuetify CSS.
- **Tree-shake Vuetify imports** in `plugins/vuetify.ts` (currently `import * as components`).
- **Replace medical "Bệnh nhân theo tháng" KPI** in DashboardView (already done in legacy view, but `/api/v1/reports/patients` endpoint was deleted — make sure nothing else references it).
- **Email user during setup** — currently no welcome flow. Setup creates owner, user logs in immediately.

---

## 7. Tech debt flagged but not fixed

Listed in priority order. Each is referenced in earlier audit reports.

### 7.1 Socket.IO not authenticated (🔴 Security)
**File:** `backend/src/app.ts` Socket.IO setup.
Current state: any client can connect and listen to `chat:message` events for all orgs.
Fix: middleware on `io.use()` that verifies JWT from `socket.handshake.auth.token`, attaches `socket.data.user`, scopes broadcasts to `room: orgId`.
Blocks: WebSocket realtime task notifications, future SLA Tracker, push features.

### 7.2 Rate limiter in-memory (🟠 Production risk)
**File:** `backend/src/modules/zalo/zalo-rate-limiter.ts`
`Map<string, number[]>` lost on restart → can spam Zalo and get accounts blocked.
Fix: persist counters to Postgres or Redis. Bump TTL precisely on restart from DB.

### 7.3 Hardcoded magic numbers (🟡 DX)
- `200 msg/day, 5 msg/30s` in zalo-rate-limiter.ts
- `OFFICIAL_AGENT_STAGE = 'dai_ly_chinh_thuc'` repeated across multiple service files (DRY violation but low impact).
- `ACTIVE_DAYS = 30` (last-order recency for "active" classification) hardcoded.
Move to Settings table eventually.

### 7.4 Race conditions in zalo-pool circuit breaker (🟡 Edge case)
**File:** `backend/src/modules/zalo/zalo-pool.ts` lines ~167-181.
Two concurrent disconnect events can both pass the "<5 in 5min" check and modify `disconnectHistory` Map non-atomically. Low impact in practice.

### 7.5 No audit log for deleted Zalo messages (🟡 Compliance)
zca-js listener marks `isDeleted=true` but doesn't record actor / when / context. Add `MessageAuditLog` if compliance regs require traceability.

### 7.6 Stale Vite errors in logs
`PatientsView.vue` import errors in old log lines (we deleted the file but Vite kept error in cache). Cleared on restart. No action needed.

### 7.7 `.env` symlink fragility
`backend/.env` is a symlink to `../.env`. Fine for dev, but production deploy needs to materialise the file (`cp -L` not `cp`).

### 7.8 Legacy untouched files
- `backend/src/modules/contacts/appointment-routes.ts` + `appointment-reminder.ts` + `appointment-sync.ts` — appointments table kept for ChatAppointments + Dashboard appointmentsToday KPI. Do NOT remove without auditing chat module.
- `frontend/src/views/AppointmentsView.vue` — file kept even though menu hidden + route redirects.
- `frontend/src/components/dashboard/*` — KpiCards, MessageVolumeChart, PipelineChart, SourceChart, AppointmentChart. Unused after dashboard redesign but kept to avoid breaking any import I missed.

---

## 8. TODO for the next session

Pick from Phase 2 (section 6.1) or tech debt (section 7). Recommended next steps in priority order:

### High-value, low-risk
1. **`/settings/cadence` admin config** — anh có thể tinh chỉnh cron expressions + targets trực tiếp từ UI. Schema sẵn, chỉ cần Vue page.
2. **`/tasks/learning` page** — nhanh, contained, tables sẵn. Phase 2 step 1.
3. **Lighthouse audit + bundle optimise** — chỉ cần build + run `lighthouse@11`, nội dung đã có trong section 6.2.

### High-value, risky
4. **Socket.IO auth fix** — blocks WebSocket task notifications + future SLA Tracker. Touches existing chat realtime, đụng `app.ts` + frontend `use-chat.ts`. Audit risk: must verify chat:message broadcasts still work after scoping by org room.
5. **Compliance score refactor 30/30/25/15 → 25/25/20/15/15** — anh sẽ thấy điểm khác trên Dashboard CEO. Communicate change to leadership before deploy.

### Setup / ops
6. **Push to git remote** — repo chưa lên đâu cả. `gh repo create ngheduocsi/crm --private --source=. --remote=origin && git push -u origin main`.
7. **Set repo-local `git config user.name/email`** — em commit với inline `-c` (không modify global). Anh nên set local config:
   ```bash
   git config user.name "..."
   git config user.email "..."
   ```
8. **Seed demo data**: 5 sales + 30 contacts in various stages + 100 orders with realistic order_dates. Helps when demo-ing CEO Dashboard / Resale / Pipeline / Sale Performance — currently DB only has 1 admin and ~2658 contacts (from old Zalo sync).

### Nice-to-have
9. **PWA icons regen** — `public/favicon.svg` is the source of truth; if anh refines logo, run `node scripts/generate-icons.mjs` to recreate the 8-icon set + iPhone splash.
10. **Confetti on task done** — pure CSS confetti is ~50 lines, no dep. Spec asked for it; left out for Phase 1 minimalism.

---

## Verification checklist before merging anything in next session

- [ ] Backend smoke test: pick 5 endpoints from your changes, `curl` each, confirm 200.
- [ ] Frontend visual: take screenshot, confirm layout matches spec.
- [ ] No TS errors: `cd backend && npx tsc --noEmit && cd ../frontend && npx vue-tsc -b`.
- [ ] Schema in sync: `cd backend && npx prisma db push --url $DATABASE_URL`.
- [ ] Cron timezone: any new cron uses `{ timezone: 'Asia/Ho_Chi_Minh' }`.
- [ ] Member-scoped: any new list endpoint defaults to `request.user.id` for member role.

---

**End of handoff.** When in doubt, search this file first. If a pattern conflicts with what's described here, **trust this file** — it's curated to capture the actual decisions made in session 1.

— Generated 2026-05-01 at end of session 1, after commit `6de01a3`.
