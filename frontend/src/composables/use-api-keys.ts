/**
 * Mã API cấp cho nhân viên (tab "Mã API" trong Cài đặt).
 * Chỉ owner/admin gọi được — backend trả 403 cho member.
 *
 * Lưu ý: mã gốc chỉ có trong response của `createApiKey` (hiện 1 lần).
 * KHÔNG lưu vào localStorage/store — đóng dialog là xoá khỏi memory.
 */
import { ref } from 'vue';
import { api } from '@/api';

export interface ApiKeyRow {
  id: string;
  name: string;
  /** 8 ký tự đầu để nhận diện — không phải mã đầy đủ. */
  keyPrefix: string;
  scope: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  user: { id: string; fullName: string; email: string; role: string };
}

export function useApiKeys() {
  const apiKeys = ref<ApiKeyRow[]>([]);
  const loading = ref(false);
  const error = ref('');

  async function fetchApiKeys() {
    loading.value = true;
    error.value = '';
    try {
      const res = await api.get('/api-keys');
      apiKeys.value = res.data.apiKeys;
    } catch (err: any) {
      error.value = err.response?.data?.error || 'Lỗi tải danh sách mã API';
    } finally {
      loading.value = false;
    }
  }

  /** Trả về mã gốc để hiện 1 lần. Gọi xong tự refresh danh sách. */
  async function createApiKey(data: { userId: string; name: string }): Promise<{
    ok: boolean;
    key?: string;
    userFullName?: string;
    error?: string;
  }> {
    try {
      const res = await api.post('/api-keys', data);
      await fetchApiKeys();
      return { ok: true, key: res.data.key, userFullName: res.data.apiKey?.user?.fullName };
    } catch (err: any) {
      return { ok: false, error: err.response?.data?.error || 'Lỗi cấp mã API' };
    }
  }

  async function revokeApiKey(id: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await api.delete(`/api-keys/${id}`);
      await fetchApiKeys();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.response?.data?.error || 'Lỗi thu hồi mã API' };
    }
  }

  return { apiKeys, loading, error, fetchApiKeys, createApiKey, revokeApiKey };
}
