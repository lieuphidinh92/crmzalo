/**
 * notification-service.ts — lõi điều phối thông báo ra ngoài hệ thống.
 *
 * Module nghiệp vụ gọi ĐÚNG 1 hàm: `notify({ orgId, event, audience, dedupeKey, data })`.
 * Nó không biết Lark/email là gì. Service làm 5 việc: chọn kênh → render →
 * chống trùng → gửi → ghi log (kèm lịch retry nếu hỏng).
 *
 * ── CHỐNG TRÙNG (quan trọng nhất) ────────────────────────────────────────────
 * Dùng ràng buộc UNIQUE của Postgres, KHÔNG dùng biến trong RAM:
 *   INSERT trước → dính P2002 nghĩa là đã có tiến trình khác gửi → im lặng bỏ qua.
 * Chặn được cả 3 ca có thật:
 *   1. Cron lỡ chạy 2 lần trong cùng 1 khung giờ.
 *   2. Render deploy kiểu rolling → 2 instance chạy chồng nhau vài chục giây,
 *      cả hai cùng tới 10:00 (RAM riêng nên khoá trong bộ nhớ vô dụng).
 *   3. Anh bấm nút "gửi thử" lại lần nữa.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { planChannels } from './notification-config.js';
import { renderTemplate } from './templates/index.js';
import type { NotifyInput, RenderedMessage, SendResult } from './notification-types.js';

/** Lịch thử lại: 5 phút → 20 phút → 60 phút, tối đa 3 lần rồi bỏ cuộc. */
const RETRY_DELAYS_MS = [5 * 60_000, 20 * 60_000, 60 * 60_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;

export interface NotifyOutcome {
  channel: string;
  status: 'sent' | 'failed' | 'skipped' | 'duplicate';
  error?: string;
}

/**
 * Phát 1 thông báo tới 1 nhóm người nhận, qua mọi kênh đang bật của nhóm đó.
 * KHÔNG bao giờ throw — thông báo hỏng không được làm chết cron nghiệp vụ.
 */
export async function notify(input: NotifyInput): Promise<NotifyOutcome[]> {
  const outcomes: NotifyOutcome[] = [];
  try {
    const message = renderTemplate(input.event, input.data);
    const plans = await planChannels(input.orgId, input.audience);

    for (const plan of plans) {
      // Giữ chỗ trong DB TRƯỚC khi gửi — đây là chốt chống trùng.
      const row = await claimRow(input, plan.channel, message.title);
      if (!row) {
        outcomes.push({ channel: plan.channel, status: 'duplicate' });
        logger.info(`[notify] Bỏ qua trùng: ${input.dedupeKey} · ${plan.channel}`);
        continue;
      }

      if (!plan.provider) {
        await markSkipped(row.id, plan.skipReason ?? 'Kênh không khả dụng');
        outcomes.push({ channel: plan.channel, status: 'skipped', error: plan.skipReason });
        continue;
      }

      const result = await deliver(row.id, plan.provider.send.bind(plan.provider), message, 1);
      outcomes.push({
        channel: plan.channel,
        status: result.ok ? 'sent' : 'failed',
        error: result.error,
      });
    }
  } catch (err) {
    // Render lỗi / DB lỗi: ghi log rõ ràng rồi thôi. Cron gọi hàm này không được sập.
    logger.error(`[notify] Lỗi khi phát ${input.event}/${input.audience}:`, err);
  }
  return outcomes;
}

/**
 * Tạo dòng log "pending". Trả về null nếu đã có dòng cùng (org, channel,
 * dedupeKey) — tức là ai đó gửi rồi.
 */
async function claimRow(
  input: NotifyInput,
  channel: string,
  title: string,
): Promise<{ id: string } | null> {
  try {
    return await prisma.notificationLog.create({
      data: {
        orgId: input.orgId,
        event: input.event,
        audience: input.audience,
        channel,
        dedupeKey: input.dedupeKey,
        payload: input.data as Prisma.InputJsonValue,
        title,
        status: 'pending',
      },
      select: { id: true },
    });
  } catch (err) {
    // P2002 = vi phạm unique = đã có bản ghi cùng khoá → đúng ý đồ, không phải lỗi.
    if ((err as { code?: string }).code === 'P2002') return null;
    throw err;
  }
}

/** Gửi thật + cập nhật trạng thái dòng log. Dùng chung cho lần đầu và retry. */
export async function deliver(
  rowId: string,
  send: (m: RenderedMessage) => Promise<SendResult>,
  message: RenderedMessage,
  attempt: number,
): Promise<SendResult> {
  let result: SendResult;
  try {
    result = await send(message);
  } catch (err) {
    result = { ok: false, error: (err as Error).message };
  }

  if (result.ok) {
    await prisma.notificationLog.update({
      where: { id: rowId },
      data: { status: 'sent', attempts: attempt, sentAt: new Date(), nextRetryAt: null, lastError: null },
    });
    return result;
  }

  const giveUp = attempt >= MAX_ATTEMPTS;
  await prisma.notificationLog.update({
    where: { id: rowId },
    data: {
      status: 'failed',
      attempts: attempt,
      // Hết lượt thì để null — cron retry sẽ không nhặt lại nữa.
      nextRetryAt: giveUp ? null : new Date(Date.now() + RETRY_DELAYS_MS[attempt - 1]),
      lastError: (result.error ?? 'Lỗi không rõ').slice(0, 500),
    },
  });

  if (giveUp) {
    logger.error(`[notify] BỎ CUỘC sau ${attempt} lần gửi (log ${rowId}): ${result.error}`);
  } else {
    logger.warn(`[notify] Gửi hỏng lần ${attempt} (log ${rowId}): ${result.error} — sẽ thử lại`);
  }
  return result;
}

async function markSkipped(rowId: string, reason: string): Promise<void> {
  await prisma.notificationLog.update({
    where: { id: rowId },
    data: { status: 'skipped', lastError: reason.slice(0, 500), nextRetryAt: null },
  });
  logger.info(`[notify] Bỏ qua kênh (log ${rowId}): ${reason}`);
}
