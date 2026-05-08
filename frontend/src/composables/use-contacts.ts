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
  fullName: string | null;
  phone: string | null;
  avatarUrl?: string | null;
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
}

export interface ContactFilters {
  search: string;
  source: string;
  customerType: string;
  stage: string;
  policyTier: string;
  province: string;
  daysInactiveBucket: string;
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

  const filters = reactive<ContactFilters>({
    search: '',
    source: '',
    customerType: '',
    stage: '',
    policyTier: '',
    province: '',
    daysInactiveBucket: '',
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
    try {
      const res = await api.post('/contacts', payload);
      await fetchContacts();
      return res.data;
    } catch (err) {
      console.error('Failed to create contact:', err);
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function updateContact(id: string, payload: Partial<Contact>): Promise<Contact | null> {
    saving.value = true;
    try {
      const res = await api.put(`/contacts/${id}`, payload);
      const idx = contacts.value.findIndex(c => c.id === id);
      if (idx !== -1) contacts.value[idx] = res.data;
      return res.data;
    } catch (err) {
      console.error('Failed to update contact:', err);
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
    contacts, total, summary, loading, saving, deleting,
    filters, pagination, sort,
    fetchContacts, fetchContact,
    createContact, updateContact, deleteContact,
    resetFilters,
    fetchContactConversations, refreshAiInsight,
  };
}
