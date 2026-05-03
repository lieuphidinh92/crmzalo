/**
 * Pancake webhook processor — runs in background after the route returns 200.
 *
 * Pipeline:
 *   1. Idempotent check (phone OR pancake_conversation_id already exists?)
 *   2. Round-robin assign + create contact
 *   3. Best-effort Zalo greeting (failure → fallback task, never crash)
 *   4. Create NEW_LEAD task + emit realtime notification
 *
 * All steps are wrapped so a downstream failure NEVER throws back to the
 * caller — the webhook log is updated with the final status instead.
 */
import type { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { pickNextSale } from '../../shared/utils/round-robin.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { ensureCategoriesSeeded } from '../tasks/task-seeds.js';

export interface PancakePayload {
  conversation_id?: string;
  customer_name?: string;
  customer_phone: string;
  facebook_id?: string;
  page_id?: string;
  first_message?: string;
}

export interface ProcessContext {
  orgId: string;
  webhookLogId: string;
  io: Server | null;
}

const WELCOME_TEMPLATE_KEY = 'welcome';
const DEFAULT_ZALO_ACCOUNT_SETTING = 'default_lead_zalo_account_id';

/**
 * Look up the org's preferred Zalo account for outbound lead messages.
 * Falls back to the first connected account in the pool for the org.
 */
async function pickZaloAccount(orgId: string): Promise<string | null> {
  const setting = await prisma.appSetting.findUnique({
    where: { orgId_settingKey: { orgId, settingKey: DEFAULT_ZALO_ACCOUNT_SETTING } },
  });
  if (setting?.valuePlain && zaloPool.getStatus(setting.valuePlain) === 'connected') {
    return setting.valuePlain;
  }
  const accounts = await prisma.zaloAccount.findMany({
    where: { orgId },
    select: { id: true },
  });
  for (const a of accounts) {
    if (zaloPool.getStatus(a.id) === 'connected') return a.id;
  }
  return null;
}

/**
 * Best-effort send Zalo welcome message. Returns true on success.
 * On any failure (no account, no template, findUser miss, send error)
 * returns false — caller will create a fallback task instead.
 */
async function sendWelcomeZalo(
  orgId: string,
  contactPhone: string,
  contactId: string,
  io: Server | null,
): Promise<boolean> {
  const accountId = await pickZaloAccount(orgId);
  if (!accountId) {
    logger.warn('[pancake] No connected Zalo account for org', orgId);
    return false;
  }
  const instance = zaloPool.getInstance(accountId);
  if (!instance?.api) return false;

  const template = await prisma.quickReplyTemplate.findUnique({
    where: { orgId_key: { orgId, key: WELCOME_TEMPLATE_KEY } },
  });
  const content = (template?.content || '').trim();
  if (!content) {
    logger.warn('[pancake] Welcome template empty for org', orgId);
    return false;
  }

  let foundUid: string | null = null;
  try {
    const res = await instance.api.findUser(contactPhone);
    foundUid = res?.uid ?? null;
  } catch (err) {
    logger.warn(`[pancake] findUser failed for ${contactPhone}:`, err);
    return false;
  }
  if (!foundUid) return false;

  // Find or create Conversation row keyed by (zaloAccountId, externalThreadId).
  const conversation = await prisma.conversation.upsert({
    where: {
      zaloAccountId_externalThreadId: {
        zaloAccountId: accountId,
        externalThreadId: foundUid,
      },
    },
    create: {
      orgId,
      zaloAccountId: accountId,
      contactId,
      threadType: 'user',
      externalThreadId: foundUid,
      lastMessageAt: new Date(),
      isReplied: true,
    },
    update: { contactId, lastMessageAt: new Date(), isReplied: true },
  });

  try {
    await instance.api.sendMessage({ msg: content }, foundUid, 0);
  } catch (err) {
    logger.warn(`[pancake] Zalo send failed for ${contactPhone}:`, err);
    return false;
  }

  // Persist outbound message + emit so the chat UI stays in sync.
  const message = await prisma.message.create({
    data: {
      id: randomUUID(),
      conversationId: conversation.id,
      senderType: 'self',
      senderName: 'CRM Auto',
      content,
      contentType: 'text',
      sentAt: new Date(),
    },
  });
  io?.emit('chat:message', { accountId, message, conversationId: conversation.id });

  // Stamp the contact with the Zalo UID we just discovered.
  await prisma.contact.update({
    where: { id: contactId },
    data: { zaloUid: foundUid },
  });

  return true;
}

export async function processPancakeLead(
  payload: PancakePayload,
  ctx: ProcessContext,
): Promise<void> {
  const { orgId, webhookLogId, io } = ctx;

  try {
    // ── Step 1: Idempotent check ─────────────────────────────────────
    const existing = await prisma.contact.findFirst({
      where: {
        orgId,
        OR: [
          { phone: payload.customer_phone },
          ...(payload.conversation_id
            ? [{ pancakeConversationId: payload.conversation_id }]
            : []),
        ],
      },
      select: { id: true, facebookId: true, pancakeConversationId: true },
    });

    if (existing) {
      // Backfill missing facebook_id / pancake_conversation_id if we have it.
      const patch: Record<string, string> = {};
      if (!existing.facebookId && payload.facebook_id) patch.facebookId = payload.facebook_id;
      if (!existing.pancakeConversationId && payload.conversation_id) {
        patch.pancakeConversationId = payload.conversation_id;
      }
      if (Object.keys(patch).length > 0) {
        await prisma.contact.update({ where: { id: existing.id }, data: patch });
      }
      await prisma.webhookLog.update({
        where: { id: webhookLogId },
        data: { status: 'duplicate' },
      });
      logger.info(`[pancake] duplicate lead ${payload.customer_phone} — skipped`);
      return;
    }

    // ── Step 2: Round-robin assign + create contact ──────────────────
    const assignedSaleId = await pickNextSale(orgId);
    const firstMessage = (payload.first_message || '').slice(0, 500);
    const contact = await prisma.contact.create({
      data: {
        orgId,
        fullName: payload.customer_name || null,
        phone: payload.customer_phone,
        facebookId: payload.facebook_id || null,
        pancakeConversationId: payload.conversation_id || null,
        source: 'FB',
        sourceDate: new Date(),
        firstContactDate: new Date(),
        stage: 'tiep_can',
        stageUpdatedAt: new Date(),
        assignedUserId: assignedSaleId,
        internalNote: firstMessage
          ? `Lead FB Pancake - ${firstMessage}`
          : 'Lead FB Pancake',
      },
    });

    // ── Step 3: Best-effort Zalo greeting ────────────────────────────
    const zaloSent = await sendWelcomeZalo(orgId, contact.phone!, contact.id, io);

    // ── Step 4: Create NEW_LEAD task ─────────────────────────────────
    if (!assignedSaleId) {
      // No sale to assign → log and stop. Webhook still counts as success
      // because the contact was created.
      await prisma.webhookLog.update({
        where: { id: webhookLogId },
        data: { status: 'success', errorMessage: 'no_active_sale_to_assign' },
      });
      logger.warn(`[pancake] contact ${contact.id} created but no sale to assign`);
      return;
    }

    const categories = await ensureCategoriesSeeded();
    const newLeadCategoryId = categories['NEW_LEAD'];

    const dueAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const dueDate = new Date(dueAt.getFullYear(), dueAt.getMonth(), dueAt.getDate());
    const dueTime = `${String(dueAt.getHours()).padStart(2, '0')}:${String(dueAt.getMinutes()).padStart(2, '0')}`;

    const customerLabel = payload.customer_name || payload.customer_phone;
    const baseTask = {
      orgId,
      categoryId: newLeadCategoryId,
      assignedToId: assignedSaleId,
      contactId: contact.id,
      dueDate,
      dueTime,
      priority: 1,
      source: 'auto',
    };

    const tasksToCreate: any[] = [
      {
        ...baseTask,
        title: `Follow-up ${customerLabel} - Lead FB`,
        description: firstMessage || null,
        metadata: {
          leadSource: 'facebook_pancake',
          pancakeConversationId: payload.conversation_id || null,
          zaloAutoSent: zaloSent,
        },
      },
    ];

    if (!zaloSent) {
      tasksToCreate.push({
        ...baseTask,
        title: `Liên hệ Zalo ${customerLabel} (auto-send fail)`,
        description:
          'Tin chào Zalo tự động không gửi được — KH có thể chưa kết bạn hoặc account Zalo chưa kết nối. Cần liên hệ thủ công.',
        metadata: { reason: 'zalo_auto_send_failed' },
      });
    }

    const createdTasks = await prisma.$transaction(
      tasksToCreate.map((t) => prisma.task.create({ data: t, include: { category: true } })),
    );

    for (const task of createdTasks) {
      io?.emit('task:new', {
        orgId,
        assignedToId: assignedSaleId,
        task,
      });
    }

    await prisma.webhookLog.update({
      where: { id: webhookLogId },
      data: { status: 'success' },
    });
    logger.info(
      `[pancake] lead ${contact.id} processed (sale=${assignedSaleId}, zalo=${zaloSent})`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[pancake] processor error:', err);
    await prisma.webhookLog
      .update({
        where: { id: webhookLogId },
        data: { status: 'failed', errorMessage: message.slice(0, 500) },
      })
      .catch(() => {});
  }
}
