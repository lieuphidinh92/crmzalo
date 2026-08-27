/**
 * log-provider.ts — "kênh" dự phòng: chỉ in ra console, không gửi đi đâu.
 *
 * Mục đích: chạy local (hoặc production lúc chưa dán webhook) vẫn xem được
 * thông báo trông thế nào mà không cần credentials, và luồng cron vẫn chạy đủ
 * các bước để test. KHÔNG bao giờ dùng kênh này thay cho kênh thật ở production
 * — service chỉ rơi về đây khi không còn kênh nào khả dụng.
 */
import { logger } from '../../../shared/utils/logger.js';
import type { NotificationProvider, RenderedMessage, SendResult } from '../notification-types.js';

export class LogProvider implements NotificationProvider {
  readonly channel = 'log' as const;

  async send(message: RenderedMessage): Promise<SendResult> {
    logger.info(
      `[notify:log] ${message.title}\n` +
        message.lines.join('\n') +
        (message.alert ? `\n⚠️ ${message.alert}` : '') +
        (message.actionUrl ? `\n→ ${message.actionUrl}` : ''),
    );
    return { ok: true };
  }
}
