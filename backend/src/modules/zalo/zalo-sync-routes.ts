/**
 * zalo-sync-routes.ts — Endpoints to sync Zalo data to CRM.
 *
 *   POST /api/v1/zalo-accounts/:id/sync-contacts          (admin)
 *   POST /api/v1/conversations/:id/sync-history           (zaloAccess('read'))
 *
 * sync-history is GROUP-ONLY because zca-js only exposes
 * `getGroupChatHistory(threadId, count)`. There is no equivalent for
 * 1-1 user chats — that limitation is documented in the UI banner.
 */
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { requireZaloAccess } from './zalo-access-middleware.js';
import { zaloPool } from './zalo-pool.js';
import { logger } from '../../shared/utils/logger.js';
import { randomUUID } from 'node:crypto';
import { handleIncomingMessage } from '../chat/message-handler.js';
import { detectContentType } from './zalo-message-helpers.js';

export async function zaloSyncRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // Sync all friends from a Zalo account to contacts
  app.post('/api/v1/zalo-accounts/:id/sync-contacts', { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const instance = zaloPool.getInstance(id);
      if (!instance?.api) return reply.status(400).send({ error: 'Zalo account not connected' });

      try {
        const result = await instance.api.getAllFriends();
        // getAllFriends returns object with profiles
        const friends = Object.values(result || {}) as any[];
        let created = 0, updated = 0;

        for (const friend of friends) {
          const uid = friend.userId || friend.uid || '';
          if (!uid) continue;

          const zaloName = friend.zaloName || friend.zalo_name || friend.displayName || friend.display_name || '';
          const avatar = friend.avatar || '';
          const phone = friend.phoneNumber || '';

          const existing = await prisma.contact.findFirst({
            where: { zaloUid: uid, orgId: user.orgId },
          });

          if (existing) {
            await prisma.contact.update({
              where: { id: existing.id },
              data: {
                fullName: zaloName || existing.fullName,
                avatarUrl: avatar || existing.avatarUrl,
                phone: phone || existing.phone,
              },
            });
            updated++;
          } else {
            await prisma.contact.create({
              data: {
                id: randomUUID(),
                orgId: user.orgId,
                zaloUid: uid,
                fullName: zaloName || 'Unknown',
                avatarUrl: avatar || null,
                phone: phone || null,
              },
            });
            created++;
          }
        }

        logger.info(`[sync] Zalo contacts: ${created} created, ${updated} updated`);
        return { success: true, created, updated, total: friends.length };
      } catch (err) {
        logger.error('[sync] Zalo contacts error:', err);
        return reply.status(500).send({ error: 'Sync failed: ' + String(err) });
      }
    }
  );

  // ── Sync chat history for a GROUP conversation ──────────────────────
  // zca-js only exposes getGroupChatHistory; user-1-1 chats return 400.
  app.post<{ Params: { id: string }; Body?: { count?: number } }>(
    '/api/v1/conversations/:id/sync-history',
    { preHandler: requireZaloAccess('read') },
    async (request, reply) => {
      const user = request.user!;
      const conv = await prisma.conversation.findFirst({
        where: { id: request.params.id, orgId: user.orgId },
        include: { zaloAccount: true, contact: true },
      });
      if (!conv) return reply.status(404).send({ error: 'Conversation không tồn tại' });
      if (conv.threadType !== 'group') {
        return reply.status(400).send({
          error: 'Zalo không hỗ trợ tải lịch sử cho chat 1-1, chỉ áp dụng cho group',
          code: 'USER_CHAT_NOT_SUPPORTED',
        });
      }
      if (!conv.externalThreadId) {
        return reply.status(400).send({ error: 'Conversation chưa có externalThreadId' });
      }

      const instance = zaloPool.getInstance(conv.zaloAccountId);
      if (!instance?.api?.getGroupChatHistory) {
        return reply.status(400).send({ error: 'Tài khoản Zalo chưa kết nối' });
      }

      const requested = Number(request.body?.count) || 50;
      const count = Math.min(Math.max(requested, 1), 200);

      try {
        const result = await instance.api.getGroupChatHistory(conv.externalThreadId, count);
        const rawMsgs: any[] = (result as any)?.groupMsgs || [];
        if (rawMsgs.length === 0) {
          return { synced: 0, skipped: 0, fetched: 0, more: 0 };
        }

        // Dedupe in one query: only insert msgIds we haven't seen.
        const incomingIds = rawMsgs.map((m) => String(m.msgId)).filter(Boolean);
        const existingRows = await prisma.message.findMany({
          where: { conversationId: conv.id, zaloMsgId: { in: incomingIds } },
          select: { zaloMsgId: true },
        });
        const seen = new Set(existingRows.map((r) => r.zaloMsgId));

        const groupName = conv.contact?.fullName || 'Nhóm';
        const selfUid = (instance as any).zaloUid || '';

        let synced = 0;
        let skipped = 0;
        for (const m of rawMsgs) {
          const msgId = String(m.msgId || '');
          if (!msgId || seen.has(msgId)) {
            skipped++;
            continue;
          }
          const senderUid = String(m.uidFrom || '');
          const isSelf = !!selfUid && senderUid === String(selfUid);
          const rawContent = m.content;
          const content =
            typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent ?? '');
          const contentType = detectContentType(m.msgType, rawContent);
          const ts = parseInt(String(m.ts || '0'));

          const ok = await handleIncomingMessage({
            accountId: conv.zaloAccountId,
            senderUid,
            senderName: m.dName || '',
            content,
            contentType,
            msgId,
            timestamp: Number.isFinite(ts) && ts > 0 ? ts : Date.now(),
            isSelf,
            threadId: conv.externalThreadId,
            threadType: 'group',
            groupName,
            attachments: [],
          });
          if (ok) synced++;
          else skipped++;
        }

        logger.info(
          `[sync-history] conv=${conv.id} fetched=${rawMsgs.length} synced=${synced} skipped=${skipped}`,
        );
        return {
          synced,
          skipped,
          fetched: rawMsgs.length,
          more: Number((result as any)?.more ?? 0),
        };
      } catch (err) {
        logger.error('[sync-history] error:', err);
        return reply.status(500).send({ error: 'Sync failed: ' + String(err) });
      }
    },
  );
}
