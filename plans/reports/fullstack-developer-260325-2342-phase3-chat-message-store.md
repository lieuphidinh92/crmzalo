# Phase Implementation Report

### Executed Phase
- Phase: Phase 3 Backend — Real-time Chat & Message Store
- Plan: none (inline task)
- Status: completed

### Files Modified
- `backend/src/modules/chat/message-handler.ts` — created, 162 lines
- `backend/src/modules/chat/chat-routes.ts` — created, 152 lines
- `backend/src/modules/zalo/zalo-pool.ts` — updated startListener (+import, message/undo handlers)
- `backend/src/app.ts` — added chatRoutes import + registration

### Tasks Completed
- [x] Created `message-handler.ts` with `handleIncomingMessage` and `handleMessageUndo`
  - find-or-create Contact (by zaloUid + orgId, not upsert)
  - find-or-create Conversation (by zaloAccountId + externalThreadId, uses unique index)
  - inserts Message with all required fields
  - updates conversation lastMessageAt / unreadCount / isReplied
- [x] Updated `zalo-pool.ts` startListener — message event persists to DB + emits structured result; undo event soft-deletes + emits msgId
- [x] Created `chat-routes.ts` with 5 endpoints:
  - GET /api/v1/conversations (paginated, search, accountId filter)
  - GET /api/v1/conversations/:id
  - GET /api/v1/conversations/:id/messages (paginated, reversed to asc)
  - POST /api/v1/conversations/:id/messages (send via zca-js, save to DB, emit)
  - POST /api/v1/conversations/:id/mark-read
- [x] Registered chatRoutes in app.ts after zaloRoutes
- [x] `npx tsc --noEmit` — 0 errors

### Tests Status
- Type check: pass (clean tsc output)
- Unit tests: n/a (no test suite configured)
- Integration tests: n/a

### Issues Encountered
- None. The `@@unique([zaloAccountId, externalThreadId])` index on Conversation means `findFirst` + `create` is race-safe in practice; a true upsert would require `findUnique` with the composite key name, but Prisma 7 doesn't expose composite unique finders directly without the `@@unique` field name — `findFirst` is the correct pattern here.

### Next Steps
- Frontend integration: consume `chat:message` / `chat:deleted` Socket.IO events
- Content-type detection: currently hardcoded to `'text'`; zca-js message may carry image/sticker payloads that need type inference
- Attachment handling: `attachments` field populated as empty array; image URLs need extraction from zca-js message object
