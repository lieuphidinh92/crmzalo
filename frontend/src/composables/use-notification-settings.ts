/**
 * Tab "Thông báo" trong Cài đặt — bật/tắt kênh gửi thông báo ra ngoài
 * (Lark, email) cho từng nhóm người nhận.
 *
 * Chỉ owner/admin gọi được — backend trả 403 cho member.
 *
 * Phân biệt 2 khái niệm, đừng gộp:
 *   • `batTat`  — anh CÓ MUỐN gửi qua kênh này không (lưu trong DB, đổi ngay).
 *   • `sanSang` — kênh ĐÃ ĐỦ cấu hình để gửi chưa (khoá/địa chỉ nằm ở biến môi
 *     trường trên Render, phải anh Philip đặt). Bật mà chưa sẵn sàng thì tới giờ
 *     hệ thống bỏ qua kênh đó và ghi lý do vào nhật ký.
 */
import { ref } from 'vue';
import { api } from '@/api';

export interface ChannelSetting {
  channel: string;
  batTat: boolean;
  sanSang: boolean;
  lyDo: string | null;
}

export interface AudienceSetting {
  audience: string;
  nhan: string;
  channels: ChannelSetting[];
}

export interface NotificationLogRow {
  id: string;
  event: string;
  audience: string;
  channel: string;
  title: string;
  status: string;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
}

export function useNotificationSettings() {
  const audiences = ref<AudienceSetting[]>([]);
  const logs = ref<NotificationLogRow[]>([]);
  const loading = ref(false);
  const error = ref('');

  async function fetchSettings() {
    loading.value = true;
    error.value = '';
    try {
      const [settingsRes, logsRes] = await Promise.all([
        api.get('/notifications/settings'),
        api.get('/notifications/logs', { params: { limit: 20 } }),
      ]);
      audiences.value = settingsRes.data.audiences;
      logs.value = logsRes.data.logs;
    } catch (err: any) {
      error.value = err.response?.data?.error || 'Lỗi tải cấu hình thông báo';
    } finally {
      loading.value = false;
    }
  }

  async function toggleChannel(
    audience: string,
    channel: string,
    enabled: boolean,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await api.put('/notifications/settings', { audience, channel, enabled });
      const target = audiences.value.find((a) => a.audience === audience);
      if (target) target.channels = res.data.channels;
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.response?.data?.error || 'Lỗi lưu cấu hình' };
    }
  }

  /** Gửi thử ngay. Hàng chờ trống thì backend gửi tin MẪU có nhãn [THỬ NGHIỆM]. */
  async function sendTest(): Promise<{ ok: boolean; ketQua?: string; error?: string }> {
    try {
      const res = await api.post('/notifications/test');
      const outcomes = (res.data.results ?? []).flatMap((r: any) => r.outcomes ?? []);
      await fetchSettings();
      if (outcomes.length === 0) return { ok: true, ketQua: 'Không có kênh nào được bật' };
      const moTa = outcomes
        .map((o: any) => `${o.channel}: ${trangThai(o.status)}${o.error ? ` (${o.error})` : ''}`)
        .join(' · ');
      return { ok: true, ketQua: moTa };
    } catch (err: any) {
      return { ok: false, error: err.response?.data?.error || 'Lỗi gửi thử' };
    }
  }

  return { audiences, logs, loading, error, fetchSettings, toggleChannel, sendTest };
}

export function trangThai(status: string): string {
  const map: Record<string, string> = {
    sent: 'đã gửi',
    failed: 'thất bại',
    skipped: 'bỏ qua',
    pending: 'đang gửi',
    duplicate: 'trùng — không gửi lại',
  };
  return map[status] ?? status;
}

export function tenKenh(channel: string): string {
  const map: Record<string, string> = { lark: 'Lark', email: 'Email', log: 'Nhật ký máy chủ' };
  return map[channel] ?? channel;
}
