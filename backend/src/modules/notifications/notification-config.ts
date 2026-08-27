/**
 * notification-config.ts — trả lời 2 câu: AI nhận, và gửi qua KÊNH nào.
 *
 * Đây là chỗ DUY NHẤT biết "ACCOUNTING nghĩa là nhóm Lark Xuất Nhập Kho".
 * Module nghiệp vụ chỉ nói `audience: 'ACCOUNTING'`.
 *
 * Thứ tự ưu tiên:
 *   1. `app_settings` (key `notify.<AUDIENCE>.<channel>` = 'on' | 'off')
 *      → anh bật/tắt kênh mà KHÔNG cần deploy lại.
 *   2. Mặc định trong code (bảng CHANNEL_DEFAULTS bên dưới).
 * Credentials thì LUÔN lấy từ env — không bao giờ đọc từ DB, không hardcode.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { config } from '../../config/index.js';
import { logger } from '../../shared/utils/logger.js';
import { LarkProvider } from './providers/lark-provider.js';
import { LogProvider } from './providers/log-provider.js';
import type { Audience, Channel, NotificationProvider } from './notification-types.js';

/**
 * Kênh nào bật sẵn cho nhóm nào (khi `app_settings` chưa có gì).
 * V1 (27/8/2026): kế toán nhận qua Lark. Email để Phase 2 — email công ty đang
 * là gmail cá nhân, gửi từ tên miền chưa xác thực sẽ rơi vào spam.
 */
const CHANNEL_DEFAULTS: Record<Audience, Record<Channel, boolean>> = {
  ACCOUNTING: { lark: true, email: false, log: false },
};

/**
 * Kế hoạch gửi cho 1 kênh. `skipReason` khác rỗng = không gửi nhưng VẪN ghi 1
 * dòng log status='skipped' — để sau này anh hỏi "sao hôm đó không thấy tin"
 * thì có câu trả lời, thay vì im lặng.
 */
export interface ChannelPlan {
  channel: Channel;
  provider?: NotificationProvider;
  skipReason?: string;
}

/** Đọc cờ bật/tắt trong app_settings, gộp với mặc định trong code. */
async function readChannelFlags(orgId: string, audience: Audience): Promise<Record<Channel, boolean>> {
  const flags = { ...CHANNEL_DEFAULTS[audience] };
  try {
    const rows = await prisma.appSetting.findMany({
      where: { orgId, settingKey: { startsWith: `notify.${audience}.` } },
      select: { settingKey: true, valuePlain: true },
    });
    for (const r of rows) {
      const channel = r.settingKey.split('.')[2] as Channel;
      if (channel in flags) flags[channel] = r.valuePlain === 'on';
    }
  } catch (err) {
    // Đọc cấu hình lỗi thì dùng mặc định — không được để thông báo chết theo.
    logger.warn('[notify] Không đọc được app_settings, dùng mặc định:', err);
  }
  return flags;
}

/**
 * Dựng provider cho từng kênh đang bật. Thiếu credentials → `skipReason` chứ
 * KHÔNG throw: một kênh hỏng không được kéo sập kênh còn lại.
 */
export async function planChannels(orgId: string, audience: Audience): Promise<ChannelPlan[]> {
  // Công tắc tổng — dùng khi cần im lặng toàn hệ thống (test, nghỉ lễ).
  if (!config.notifyEnabled) {
    return [{ channel: 'log', skipReason: 'NOTIFY_ENABLED=false — tắt toàn bộ thông báo ra ngoài' }];
  }

  const flags = await readChannelFlags(orgId, audience);
  const plans: ChannelPlan[] = [];

  if (flags.lark) {
    const webhook = webhookFor(audience);
    plans.push(
      webhook
        ? { channel: 'lark', provider: new LarkProvider(webhook, secretFor(audience)) }
        : { channel: 'lark', skipReason: 'Chưa cấu hình LARK_WEBHOOK_ACCOUNTING' },
    );
  }

  // Phase 2: email. Khai sẵn ở đây để bật là chạy, không phải sửa service.
  if (flags.email) {
    plans.push({ channel: 'email', skipReason: 'Kênh email chưa làm (Phase 2)' });
  }

  // Không có kênh thật nào → rơi về ghi console. Nhờ vậy chạy local không cần
  // credentials mà vẫn xem được nội dung thông báo trông thế nào.
  const hasRealProvider = plans.some(p => p.provider);
  if (!hasRealProvider) {
    plans.push({ channel: 'log', provider: new LogProvider() });
  }

  return plans;
}

function webhookFor(audience: Audience): string {
  switch (audience) {
    case 'ACCOUNTING':
      return config.larkWebhookAccounting;
    default:
      return '';
  }
}

function secretFor(audience: Audience): string {
  switch (audience) {
    case 'ACCOUNTING':
      return config.larkSecretAccounting;
    default:
      return '';
  }
}
