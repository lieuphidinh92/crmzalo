/**
 * quick-reply-routes.ts — REST API for the 5 canonical quick-reply
 * templates and the chat-side "send template" action.
 *
 * Endpoints
 *   GET  /api/v1/quick-replies                         — auth, current org
 *   PUT  /api/v1/quick-replies/:key                    — auth + role admin/owner
 *   POST /api/v1/conversations/:id/quick-reply         — auth + chat access on Zalo account
 *
 * Send pattern mirrors chat-routes.ts: rate-limit check →
 * zaloPool.api.sendMessage → persist Message → emit Socket.IO.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { requireZaloAccess } from '../zalo/zalo-access-middleware.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { zaloRateLimiter } from '../zalo/zalo-rate-limiter.js';
import { logger } from '../../shared/utils/logger.js';
import {
  buildSendPayloads,
  isValidKey,
  isValidType,
  listForOrg,
  updateForOrg,
  type QuickReplyType,
} from './quick-reply-service.js';

export async function quickReplyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // ── List 5 templates for current org (auto-seeds if missing) ──────────────
  app.get('/api/v1/quick-replies', async (request) => {
    const user = request.user!;
    return { templates: await listForOrg(user.orgId) };
  });

  // ── Update one template — admin/owner only ────────────────────────────────
  app.put<{
    Params: { key: string };
    Body: { type: string; content?: string | null; mediaUrl?: string | null };
  }>(
    '/api/v1/quick-replies/:key',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      const user = request.user!;
      const { key } = request.params;
      const { type, content, mediaUrl } = request.body;

      if (!isValidKey(key)) {
        return reply.status(400).send({ error: 'Khoá template không hợp lệ' });
      }
      if (!type || !isValidType(type)) {
        return reply.status(400).send({ error: 'Loại nội dung không hợp lệ' });
      }

      try {
        const updated = await updateForOrg(user.orgId, key, {
          type: type as QuickReplyType,
          content,
          mediaUrl,
          updatedBy: user.id,
        });
        return updated;
      } catch (err: any) {
        return reply
          .status(err.statusCode ?? 500)
          .send({ error: err.message ?? 'Update failed' });
      }
    },
  );

  // ── Send a quick-reply template into a conversation ───────────────────────
  // Same auth/rate-limit guards as POST /conversations/:id/messages.
  app.post<{
    Params: { id: string };
    Body: { key: string };
  }>(
    '/api/v1/conversations/:id/quick-reply',
    { preHandler: requireZaloAccess('chat') },
    async (request, reply) => {
      const user = request.user!;
      const { id } = request.params;
      const { key } = request.body;

      if (!isValidKey(key)) {
        return reply.status(400).send({ error: 'Khoá template không hợp lệ' });
      }

      // Load template + conversation in parallel.
      const [template, conversation] = await Promise.all([
        prisma.quickReplyTemplate.findUnique({
          where: { orgId_key: { orgId: user.orgId, key } },
        }),
        prisma.conversation.findFirst({
          where: { id, orgId: user.orgId },
          include: { zaloAccount: true },
        }),
      ]);

      if (!template) {
        return reply.status(404).send({ error: 'Template chưa được cấu hình' });
      }
      if (!conversation) {
        return reply.status(404).send({ error: 'Không tìm thấy cuộc trò chuyện' });
      }

      // Empty template guard — front-end should already prevent this.
      const hasContent = (template.content || '').trim().length > 0;
      const hasMedia = (template.mediaUrl || '').trim().length > 0;
      if (!hasContent && !hasMedia) {
        return reply
          .status(400)
          .send({ error: 'Template này chưa có nội dung. Hãy cấu hình trước.' });
      }

      const instance = zaloPool.getInstance(conversation.zaloAccountId);
      if (!instance?.api) {
        return reply.status(400).send({ error: 'Tài khoản Zalo chưa kết nối' });
      }

      const limits = zaloRateLimiter.checkLimits(conversation.zaloAccountId);
      if (!limits.allowed) {
        return reply.status(429).send({ error: limits.reason });
      }

      const payloads = buildSendPayloads({
        type: template.type as QuickReplyType,
        content: template.content,
        mediaUrl: template.mediaUrl,
      });

      const threadId = conversation.externalThreadId || '';
      const threadType = conversation.threadType === 'group' ? 1 : 0;
      const io = (app as any).io as Server;
      const persistedMessages: unknown[] = [];

      try {
        for (const item of payloads) {
          // One rate-limit slot per outbound message — combined templates
          // count as 2. Honest accounting matters for anti-block.
          const subLimits = zaloRateLimiter.checkLimits(
            conversation.zaloAccountId,
          );
          if (!subLimits.allowed) {
            return reply.status(429).send({ error: subLimits.reason });
          }
          zaloRateLimiter.recordSend(conversation.zaloAccountId);

          // zca-js: sendMessage(payload, threadId, type)
          // For attachments containing remote URLs, fall back to a plain
          // text URL if the SDK rejects the attachment.
          try {
            await instance.api.sendMessage(item.payload, threadId, threadType);
          } catch (sendErr) {
            if (item.payload.attachments?.length) {
              logger.warn(
                '[quick-reply] attachment send failed, falling back to URL text',
                sendErr,
              );
              const fallbackMsg =
                (item.payload.msg ? item.payload.msg + '\n' : '') +
                item.payload.attachments.join('\n');
              await instance.api.sendMessage(
                { msg: fallbackMsg },
                threadId,
                threadType,
              );
              item.dbContent = fallbackMsg;
              item.dbType = 'text';
            } else {
              throw sendErr;
            }
          }

          const message = await prisma.message.create({
            data: {
              id: randomUUID(),
              conversationId: id,
              senderType: 'self',
              senderUid: conversation.zaloAccount.zaloUid || '',
              senderName: 'Staff',
              content: item.dbContent,
              contentType: item.dbType,
              sentAt: new Date(),
              repliedByUserId: user.id,
            },
          });

          io?.emit('chat:message', {
            accountId: conversation.zaloAccountId,
            message,
            conversationId: id,
          });

          persistedMessages.push(message);
        }

        await prisma.conversation.update({
          where: { id },
          data: { lastMessageAt: new Date(), isReplied: true, unreadCount: 0 },
        });

        return { sent: persistedMessages.length, messages: persistedMessages };
      } catch (err) {
        logger.error('[quick-reply] Send failed:', err);
        return reply.status(500).send({ error: 'Gửi tin nhắn nhanh thất bại' });
      }
    },
  );
}
