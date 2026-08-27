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
import { EmailProvider } from './providers/email-provider.js';
import type { Audience, Channel, NotificationProvider } from './notification-types.js';

/**
 * Kênh nào bật sẵn cho nhóm nào (khi `app_settings` chưa có gì).
 * Kế toán nhận qua Lark + email (Phase 2 xong 27/8/2026). Kênh nào thiếu cấu
 * hình thì tự bỏ qua kèm lý do, KHÔNG kéo sập kênh còn lại.
 */
const CHANNEL_DEFAULTS: Record<Audience, Record<Channel, boolean>> = {
  ACCOUNTING: { lark: true, email: true, log: false },
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

  if (flags.email) {
    const recipients = recipientsFor(audience);
    if (!config.brevoApiKey) {
      plans.push({ channel: 'email', skipReason: 'Chưa cấu hình BREVO_API_KEY' });
    } else if (!config.emailFrom) {
      plans.push({ channel: 'email', skipReason: 'Chưa cấu hình EMAIL_FROM (địa chỉ gửi đã xác thực trong Brevo)' });
    } else if (recipients.length === 0) {
      plans.push({ channel: 'email', skipReason: 'Chưa có người nhận trong NOTIFY_ACCOUNTING_EMAILS' });
    } else {
      plans.push({
        channel: 'email',
        provider: new EmailProvider(config.brevoApiKey, config.emailFrom, config.emailFromName, recipients),
      });
    }
  }

  // Không có kênh thật nào → rơi về ghi console. Nhờ vậy chạy local không cần
  // credentials mà vẫn xem được nội dung thông báo trông thế nào.
  const hasRealProvider = plans.some(p => p.provider);
  if (!hasRealProvider) {
    plans.push({ channel: 'log', provider: new LogProvider() });
  }

  return plans;
}

/**
 * Người nhận email của 1 nhóm. Cố ý lấy từ BIẾN MÔI TRƯỜNG chứ không suy từ
 * quyền trong DB: hiện chưa ai được bật cờ `can_issue_vat`, mà tài khoản owner
 * lại mang email nội bộ không có thật — suy tự động sẽ gửi vào hư không.
 * Thêm/bớt người = sửa env trên Render, không phải deploy lại.
 */
function recipientsFor(audience: Audience): string[] {
  const raw = audience === 'ACCOUNTING' ? config.notifyAccountingEmails : '';
  return raw
    .split(',')
    .map(e => e.trim())
    .filter(e => e.includes('@'));
}

/**
 * Chẩn đoán: kênh nào SẴN SÀNG, kênh nào bị bỏ qua vì lý do gì — KHÔNG gửi gì cả.
 * Có hàm này để sau khi dán biến môi trường trên Render là kiểm được ngay, thay
 * vì phải chờ tới 10:00 mới biết mình gõ thiếu ký tự (im lặng vì lỗi cấu hình
 * nhìn y hệt im lặng vì không có đơn nào chờ).
 */
export async function describeChannels(
  orgId: string,
  audience: Audience,
): Promise<Array<{ channel: string; sanSang: boolean; lyDo: string | null }>> {
  const plans = await planChannels(orgId, audience);
  return plans.map(p => ({ channel: p.channel, sanSang: !!p.provider, lyDo: p.skipReason ?? null }));
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
