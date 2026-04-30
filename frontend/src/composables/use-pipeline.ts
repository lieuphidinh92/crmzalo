/**
 * use-pipeline — fetch + state for the opportunity pipeline page.
 *
 * Drag-drop calls `moveStage` which both updates server state AND
 * optimistically patches the local columns so the card lands instantly.
 */
import { reactive, ref } from 'vue';
import { api } from '@/api/index';

export const PIPELINE_STAGES = [
  'tiep_can',
  'da_bao_gia',
  'dang_thu_hang',
  'dai_ly_chinh_thuc',
  'ngung',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  tiep_can: 'Tiếp cận',
  da_bao_gia: 'Đã báo giá',
  dang_thu_hang: 'Đang thử hàng',
  dai_ly_chinh_thuc: 'Đại lý chính thức',
  ngung: 'Ngừng',
};

export const STAGE_COLORS: Record<PipelineStage, string> = {
  tiep_can: 'grey',
  da_bao_gia: 'info',
  dang_thu_hang: 'warning',
  dai_ly_chinh_thuc: 'success',
  ngung: 'error',
};

export interface PipelineDeal {
  contactId: string;
  fullName: string | null;
  storeName: string | null;
  phone: string | null;
  customerType: string | null;
  assignedUser: { id: string; fullName: string } | null;
  potentialValue: number;
  stage: PipelineStage;
  stageUpdatedAt: string | null;
  daysIdle: number;
  isStuck: boolean;
}

export interface PipelineColumn {
  stage: PipelineStage;
  label: string;
  count: number;
  totalValue: number;
  deals: PipelineDeal[];
}

export interface PipelineMetrics {
  totalPipelineValue: number;
  conversionRate: { rate: number; converted: number; total: number };
  avgClosingDays: { days: number; sample: number };
  stuckCount: number;
}

export interface PipelineFilters {
  saleId: string | null;
  from: string;
  to: string;
}

function defaultFilters(): PipelineFilters {
  const today = new Date();
  const prior = new Date(today);
  prior.setDate(prior.getDate() - 90); // 90-day default window for funnel
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { saleId: null, from: fmt(prior), to: fmt(today) };
}

export function usePipeline() {
  const filters = reactive<PipelineFilters>(defaultFilters());

  const columns = ref<PipelineColumn[]>([]);
  const metrics = ref<PipelineMetrics | null>(null);
  const stuckReasons = ref<Array<{ reason: string; count: number }>>([]);

  const loadingDeals = ref(false);
  const loadingMetrics = ref(false);
  const loadingReasons = ref(false);
  const moving = ref<string | null>(null); // contactId currently being moved
  const error = ref<string | null>(null);

  function buildParams() {
    return {
      sale_id: filters.saleId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    };
  }

  async function fetchDeals() {
    loadingDeals.value = true;
    try {
      const res = await api.get('/pipeline', { params: buildParams() });
      columns.value = res.data.columns ?? [];
      error.value = null;
    } catch (err: any) {
      error.value = err?.response?.data?.error ?? 'Lỗi tải pipeline';
    } finally {
      loadingDeals.value = false;
    }
  }

  async function fetchMetrics() {
    loadingMetrics.value = true;
    try {
      const res = await api.get('/pipeline/conversion-stats', {
        params: buildParams(),
      });
      metrics.value = res.data;
    } finally {
      loadingMetrics.value = false;
    }
  }

  async function fetchStuckReasons() {
    loadingReasons.value = true;
    try {
      const res = await api.get('/pipeline/stuck-reasons', {
        params: buildParams(),
      });
      stuckReasons.value = res.data.reasons ?? [];
    } finally {
      loadingReasons.value = false;
    }
  }

  async function fetchAll() {
    await Promise.all([fetchDeals(), fetchMetrics(), fetchStuckReasons()]);
  }

  /** Move a deal to a new stage. Returns the API response or throws. */
  async function moveStage(
    contactId: string,
    newStage: PipelineStage,
    reason?: string,
  ) {
    moving.value = contactId;
    try {
      const res = await api.patch(`/contacts/${contactId}/stage`, {
        newStage,
        reason: reason ?? null,
      });
      // Refresh metrics + stuck reasons (deals already updated optimistically
      // by the drag-drop component) — server has invalidated its own cache.
      await Promise.all([fetchMetrics(), fetchStuckReasons()]);
      return res.data;
    } finally {
      moving.value = null;
    }
  }

  return {
    filters,
    columns,
    metrics,
    stuckReasons,
    loadingDeals,
    loadingMetrics,
    loadingReasons,
    moving,
    error,
    fetchDeals,
    fetchMetrics,
    fetchStuckReasons,
    fetchAll,
    moveStage,
  };
}

/* ── Formatters reused across components ─────────────────────────────── */

export function formatVNDShort(n: number | null | undefined): string {
  if (n == null) return '0';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + ' tỷ';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(0) + ' tr';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'k';
  return new Intl.NumberFormat('vi-VN').format(n);
}

const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  nha_thuoc: 'Nhà thuốc',
  si_online: 'Sỉ online',
  duoc_si: 'Dược sĩ',
  cua_hang_me_be: 'Mẹ bé',
};

export function customerTypeLabel(t: string | null): string {
  if (!t) return '—';
  return CUSTOMER_TYPE_LABELS[t] ?? t;
}
