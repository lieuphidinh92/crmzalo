/**
 * Composable for contact (khách hàng) management — B2B sales only.
 * - List with filters, pagination
 * - CRUD operations
 * - AI insight refresh
 */
import { ref, reactive } from 'vue';
import { api } from '@/api/index';

export interface AIInsight {
  summary?: string;
  pain_points?: string[];
  buying_signals?: string[];
  objections?: string[];
  recommended_actions?: string[];
  best_time_to_contact?: string;
  relationship_temperature?: 'cold' | 'warm' | 'hot' | string;
}

export interface Contact {
  id: string;
  customerCode?: string | null;
  fullName: string | null;
  phone: string | null;
  avatarUrl?: string | null;
  // PR2 — Phase 3+4
  birthday?: string | null;
  specialDates?: Array<{ label: string; date: string }>;
  customerRank?: string | null;
  rankScore?: number | string | null;
  rankUpdatedAt?: string | null;
  source: string | null;
  notes: string | null;
  tags: string[];
  assignedUserId?: string | null;
  assignedUser?: { id?: string; fullName: string } | null;
  createdAt?: string;
  firstContactDate?: string | null;
  // === B2B sales fields ===================================================
  storeName?: string | null;
  province?: string | null;
  customerType?: string | null;
  scale?: string | null;
  currentProducts?: string[];
  currentSupplier?: string | null;
  monthlyRevenueEstimate?: string | null;
  avgOrderQuantity?: string | null;
  stage?: string | null;
  stuckReason?: string | null;
  policyTier?: string | null;
  debtAmount?: number | string | null;
  potentialValue?: number | string | null;
  stageUpdatedAt?: string | null;
  lastOrderDate?: string | null;
  nextContactDate?: string | null;
  internalNote?: string | null;
  rewardPoints?: number;
  aiInsight?: AIInsight | null;
  aiInsightUpdatedAt?: string | null;
  // === Server-computed metrics (list endpoint only) =======================
  daysSinceLastOrder?: number | null;
  revenueYtd?: number;
  profitYtd?: number;
  revenueMonth?: number;
  profitMonth?: number;
  revenueLifetime?: number;
  profitLifetime?: number | null;
  revenue60d?: number;
  profit60d?: number | null;
}

export interface ContactFilters {
  search: string;
  source: string;
  customerType: string;
  stage: string;
  policyTier: string;
  province: string;
  daysInactiveBucket: string;
  customerRank: string;
}

export const CUSTOMER_RANK_OPTIONS = [
  { value: 'top_1', text: 'Top 1 — VIP (80-100đ)', color: 'amber' },
  { value: 'top_2', text: 'Top 2 — Thân thiết (50-79đ)', color: 'success' },
  { value: 'top_3', text: 'Top 3 — Thường (20-49đ)', color: 'info' },
  { value: 'top_4', text: 'Top 4 — Ít hoạt động (0-19đ)', color: 'grey' },
];

export const CUSTOMER_RANK_FILTER_OPTIONS = [
  ...CUSTOMER_RANK_OPTIONS.map(o => ({ value: o.value, text: o.text })),
  { value: 'no_data', text: 'Chưa có dữ liệu' },
];

export function customerRankShortLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const m: Record<string, string> = {
    top_1: 'Top 1 VIP',
    top_2: 'Top 2 Thân',
    top_3: 'Top 3 Thường',
    top_4: 'Top 4 Ít',
  };
  return m[value] ?? value;
}

export function customerRankColor(value: string | null | undefined): string {
  return CUSTOMER_RANK_OPTIONS.find(o => o.value === value)?.color ?? 'grey';
}

export const DAYS_INACTIVE_OPTIONS = [
  { text: 'Tất cả', value: '' },
  { text: 'Active (<30 ngày)', value: 'active' },
  { text: 'Cần chăm (30-60 ngày)', value: 'need_care' },
  { text: 'Sắp mất (61-90 ngày)', value: 'about_to_lose' },
  { text: 'Đã mất (>90 ngày)', value: 'lost' },
  { text: 'Chưa từng đặt', value: 'never' },
];

export const CUSTOMER_TYPE_OPTIONS = [
  { text: 'Nhà thuốc', value: 'nha_thuoc' },
  { text: 'Sỉ online', value: 'si_online' },
  { text: 'Dược sĩ tự do', value: 'duoc_si' },
  { text: 'Cửa hàng mẹ bé', value: 'cua_hang_me_be' },
];

export const STAGE_OPTIONS = [
  { text: 'Tiếp cận', value: 'tiep_can' },
  { text: 'Đã báo giá', value: 'da_bao_gia' },
  { text: 'Đang thử hàng', value: 'dang_thu_hang' },
  { text: 'Đại lý chính thức', value: 'dai_ly_chinh_thuc' },
  { text: 'Ngừng hợp tác', value: 'ngung' },
];

export const SCALE_OPTIONS = [
  { text: 'Nhỏ', value: 'nho' },
  { text: 'Vừa', value: 'vua' },
  { text: 'Lớn', value: 'lon' },
];

export const POLICY_TIER_OPTIONS = [
  { text: 'CTV', value: 'ctv' },
  { text: 'Đại lý cấp 1', value: 'dai_ly_cap_1' },
  { text: 'Đại lý cấp 2', value: 'dai_ly_cap_2' },
];

export const SOURCE_OPTIONS = [
  { text: 'Zalo', value: 'zalo' },
  { text: 'Facebook', value: 'facebook' },
  { text: 'Giới thiệu', value: 'gioi_thieu' },
  { text: 'Khác', value: 'khac' },
];

export function useContacts() {
  const contacts = ref<Contact[]>([]);
  const total = ref(0);
  const summary = reactive({ total: 0, active: 0, needCare: 0 });
  const loading = ref(false);
  const saving = ref(false);
  const deleting = ref(false);
  // Lỗi từ lần lưu gần nhất (POST/PUT). Backend trả 400 (SĐT sai format)
  // hoặc 409 (SĐT trùng) — dialog đọc để hiển thị banner đỏ thay vì close
  // im lặng.
  const lastSaveError = ref<string | null>(null);

  function extractApiError(err: unknown): string {
    const e = err as { response?: { data?: { message?: string; error?: string } } };
    return (
      e?.response?.data?.message ??
      e?.response?.data?.error ??
      'Lưu thất bại. Vui lòng thử lại.'
    );
  }

  const filters = reactive<ContactFilters>({
    search: '',
    source: '',
    customerType: '',
    stage: '',
    policyTier: '',
    province: '',
    daysInactiveBucket: '',
    customerRank: '',
  });

  const pagination = reactive({ page: 1, limit: 50 });
  const sort = reactive({ orderBy: 'daysSinceLastOrder', order: 'desc' as 'asc' | 'desc' });

  async function fetchContacts() {
    loading.value = true;
    try {
      const res = await api.get('/contacts', {
        params: {
          page: pagination.page,
          limit: pagination.limit,
          search: filters.search || undefined,
          source: filters.source || undefined,
          customerType: filters.customerType || undefined,
          stage: filters.stage || undefined,
          policyTier: filters.policyTier || undefined,
          province: filters.province || undefined,
          daysInactiveBucket: filters.daysInactiveBucket || undefined,
          customerRank: filters.customerRank || undefined,
          orderBy: sort.orderBy || undefined,
          order: sort.order || undefined,
        },
      });
      contacts.value = res.data.contacts ?? res.data;
      total.value = res.data.total ?? contacts.value.length;
      if (res.data.summary) {
        summary.total = res.data.summary.total;
        summary.active = res.data.summary.active;
        summary.needCare = res.data.summary.needCare;
      }
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
    } finally {
      loading.value = false;
    }
  }

  async function fetchContact(id: string): Promise<Contact | null> {
    try {
      const res = await api.get(`/contacts/${id}`);
      return res.data;
    } catch (err) {
      console.error('Failed to fetch contact:', err);
      return null;
    }
  }

  async function createContact(payload: Partial<Contact>): Promise<Contact | null> {
    saving.value = true;
    lastSaveError.value = null;
    try {
      const res = await api.post('/contacts', payload);
      await fetchContacts();
      return res.data;
    } catch (err) {
      console.error('Failed to create contact:', err);
      lastSaveError.value = extractApiError(err);
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function updateContact(id: string, payload: Partial<Contact>): Promise<Contact | null> {
    saving.value = true;
    lastSaveError.value = null;
    try {
      const res = await api.put(`/contacts/${id}`, payload);
      const idx = contacts.value.findIndex(c => c.id === id);
      if (idx !== -1) contacts.value[idx] = res.data;
      return res.data;
    } catch (err) {
      console.error('Failed to update contact:', err);
      lastSaveError.value = extractApiError(err);
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function deleteContact(id: string): Promise<boolean> {
    deleting.value = true;
    try {
      await api.delete(`/contacts/${id}`);
      await fetchContacts();
      return true;
    } catch (err) {
      console.error('Failed to delete contact:', err);
      return false;
    } finally {
      deleting.value = false;
    }
  }

  function resetFilters() {
    filters.search = '';
    filters.source = '';
    filters.customerType = '';
    filters.stage = '';
    filters.policyTier = '';
    filters.province = '';
    filters.daysInactiveBucket = '';
    filters.customerRank = '';
    pagination.page = 1;
    fetchContacts();
  }

  // ── Helpers for the slide-over panel ─────────────────────────────────────

  /** Fetch the conversations linked to this contact (sorted newest first). */
  async function fetchContactConversations(contactId: string): Promise<
    Array<{
      id: string;
      threadType: string;
      lastMessageAt: string | null;
      zaloAccount: { id: string; displayName: string | null };
    }>
  > {
    const res = await api.get(`/contacts/${contactId}/conversations`);
    return res.data.conversations ?? [];
  }

  /**
   * Trigger an AI-insight refresh. Backend handles the incremental window
   * (only messages newer than last `aiInsightUpdatedAt` unless reset=true).
   */
  async function refreshAiInsight(
    contactId: string,
    options: { reset?: boolean } = {},
  ): Promise<{
    status: 'created' | 'updated' | 'unchanged' | 'no_messages';
    insight: AIInsight | null;
    updatedAt: string | null;
    message?: string;
  }> {
    const res = await api.post(`/contacts/${contactId}/ai-insight`, {
      reset: options.reset === true,
    });
    return res.data;
  }

  return {
    contacts, total, summary, loading, saving, deleting, lastSaveError,
    filters, pagination, sort,
    fetchContacts, fetchContact,
    createContact, updateContact, deleteContact,
    resetFilters,
    fetchContactConversations, refreshAiInsight,
  };
}
