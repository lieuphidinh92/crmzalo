# Phase Implementation Report

## Executed Phase
- Phase: fix-zalo-message-structure
- Plan: none (direct task)
- Status: completed

## Files Modified

| File | Lines | Action |
|---|---|---|
| `src/modules/chat/message-handler.ts` | 209 | Updated |
| `src/modules/zalo/zalo-pool.ts` | 190 | Updated |
| `src/modules/zalo/zalo-listener-factory.ts` | 160 | Created |
| `src/modules/zalo/zalo-message-helpers.ts` | 37 | Created |

## Tasks Completed

- [x] Added `threadType: 'user' | 'group'` and `groupName?: string` to `IncomingMessage` interface
- [x] Fixed `findOrCreateConversation` — `externalThreadId` now always uses `msg.threadId` (correct for both user and group threads)
- [x] Fixed `upsertContact` — group messages create/update a Contact record representing the group (zaloUid = group ID, `metadata.isGroup = true`); self user messages return null
- [x] Fixed `threadType` in `conversation.create` — uses `msg.threadType` instead of hardcoded `'user'`
- [x] Added `UserInfoCacheEntry` interface + shared `userInfoCache` map in pool (5-min TTL)
- [x] Added `resolveZaloName(api, uid, cache)` — fetches `zaloName` from `getUserInfo`, caches result
- [x] Added `resolveGroupName(api, groupId)` — fetches group name from `getGroupInfo`
- [x] Added `detectContentType(msgType, content)` — maps zca-js msgType strings to normalized labels
- [x] Added `updateContactAvatar(zaloUid, avatarUrl)` — fire-and-forget avatar backfill
- [x] Updated `listener.on('message')` handler — detects `message.type === 1` for group, resolves zaloName/groupName, passes correct `threadType`
- [x] Modularised: listener logic extracted to `zalo-listener-factory.ts`; helpers to `zalo-message-helpers.ts`; `zalo-pool.ts` reduced to 190 lines

## Tests Status
- Type check: **PASS** (`npx tsc --noEmit` — zero errors)
- Unit tests: n/a (no test suite present in project)
- Integration tests: n/a

## Issues Encountered

None. All fixes applied cleanly; no schema changes required (Conversation model already has `threadType` and `externalThreadId` columns).

## Next Steps

- `externalThreadId` unique constraint on `conversations` table (`@@unique([zaloAccountId, externalThreadId])`) works correctly for both user and group threads since `threadId` is unique per thread.
- Consider adding a group-info cache (TTL) similar to user-info cache if `getGroupInfo` latency becomes a concern.
- No docs impact on existing API contracts.
