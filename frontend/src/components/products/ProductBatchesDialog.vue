<template>
  <v-dialog v-model="open" max-width="900" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">mdi-package-variant</v-icon>
        Chi tiết các lô — {{ productSku }}
        <v-spacer />
        <v-btn icon variant="text" @click="open = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-card-text>
        <!-- Cost stats card (owner|admin only) -->
        <v-card
          v-if="costStats?.canSee && costStats.importCount > 0"
          variant="flat"
          class="cost-stats-card pa-4 mb-4"
        >
          <div class="cost-stats-title">
            <v-icon size="16" color="primary">mdi-cash-multiple</v-icon>
            Giá vốn 6 tháng qua ({{ costStats.importCount }} lần nhập)
          </div>
          <v-row dense class="mt-2">
            <v-col cols="4">
              <div class="cost-label">Thấp nhất</div>
              <div class="cost-value">{{ formatVND(costStats.min) }}</div>
            </v-col>
            <v-col cols="4">
              <div class="cost-label">TB (theo SL)</div>
              <div class="cost-value cost-value--avg">{{ formatVND(costStats.avg) }}</div>
            </v-col>
            <v-col cols="4">
              <div class="cost-label">Cao nhất</div>
              <div class="cost-value">{{ formatVND(costStats.max) }}</div>
            </v-col>
          </v-row>
        </v-card>

        <v-card
          v-else-if="costStats?.canSee && costStats.importCount === 0"
          variant="flat"
          class="cost-stats-card pa-3 mb-4 text-center text-caption text-medium-emphasis"
        >
          Chưa có đơn nhập nào trong 6 tháng qua cho SP này.
        </v-card>

        <!-- Full batches table -->
        <div class="d-flex align-center mb-2">
          <span class="text-caption text-medium-emphasis">
            Tất cả lô của SP này ({{ batches.length }} lô)
          </span>
        </div>

        <v-progress-linear v-if="loading" indeterminate color="primary" />

        <div v-else-if="batches.length === 0" class="text-center py-4 text-medium-emphasis">
          Chưa có lô nào
        </div>

        <v-table v-else density="compact">
          <thead>
            <tr>
              <th>Mã lô</th>
              <th>Ngày nhập</th>
              <th>HSD</th>
              <th class="text-right">Nhập</th>
              <th class="text-right">Còn</th>
              <th v-if="canSeeCost" class="text-right">Giá vốn</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in batches" :key="b.id">
              <td class="font-mono">{{ b.batchCode }}</td>
              <td class="text-caption">{{ formatDate(b.importedAt) }}</td>
              <td class="text-caption">{{ formatDate(b.expiryDate) }}</td>
              <td class="text-right font-mono">{{ b.importQuantity }}</td>
              <td class="text-right font-mono">
                <span :class="b.currentQuantity === 0 ? 'text-error' : ''">
                  {{ b.currentQuantity }}
                </span>
              </td>
              <td v-if="canSeeCost" class="text-right font-mono">
                {{ formatVND(b.importCost) }}
              </td>
              <td>
                <v-chip
                  size="x-small"
                  variant="tonal"
                  :color="statusColor(b.status, b.warning)"
                >
                  {{ statusLabel(b.status, b.warning) }}
                </v-chip>
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">Đóng</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api } from '@/api/index';

interface Batch {
  id: string;
  batchCode: string;
  importedAt: string;
  expiryDate: string | null;
  importQuantity: number;
  currentQuantity: number;
  importCost: number | string | null;
  status: string;
  warning?: string | null;
}

interface CostStats {
  canSee: boolean;
  importCount: number;
  min: number | null;
  max: number | null;
  avg: number | null;
}

const props = defineProps<{
  modelValue: boolean;
  productId: string;
  productSku: string;
  canSeeCost: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const loading = ref(false);
const batches = ref<Batch[]>([]);
const costStats = ref<CostStats | null>(null);

watch(
  () => props.modelValue,
  async (v) => {
    if (!v || !props.productId) return;
    await Promise.all([loadBatches(), loadCostStats()]);
  },
);

async function loadBatches() {
  loading.value = true;
  try {
    const { data } = await api.get('/inventory/batches', {
      params: { productId: props.productId, limit: 200 },
    });
    batches.value = data.batches ?? [];
  } catch (err) {
    console.error('[ProductBatches] load failed:', err);
  } finally {
    loading.value = false;
  }
}

async function loadCostStats() {
  // Member gets `{ canSee: false }` from the backend without a 403 so
  // we don't have to special-case roles client-side.
  if (!props.canSeeCost) {
    costStats.value = null;
    return;
  }
  try {
    const { data } = await api.get<CostStats>(
      `/products/${props.productId}/cost-stats`,
    );
    costStats.value = data;
  } catch (err) {
    console.error('[ProductBatches] cost-stats failed:', err);
  }
}

function formatVND(n: number | string | null): string {
  if (n === null || n === undefined || n === '') return '—';
  const v = typeof n === 'string' ? Number(n) : n;
  if (!Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('vi-VN').format(Math.round(v)) + ' đ';
}

function formatDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function statusLabel(status: string, warning?: string | null): string {
  if (status === 'recalled') return 'Thu hồi';
  if (status === 'expired') return 'Hết hạn';
  if (warning === 'expiring_30') return 'Sắp hết (<30d)';
  if (warning === 'expiring_60') return 'Sắp hết (<60d)';
  if (warning === 'expiring_90') return 'Sắp hết (<90d)';
  return 'Còn hạn';
}

function statusColor(status: string, warning?: string | null): string {
  if (status === 'recalled') return 'grey';
  if (status === 'expired' || warning === 'expired') return 'error';
  if (warning === 'expiring_30') return 'error';
  if (warning === 'expiring_60' || warning === 'expiring_90') return 'warning';
  return 'success';
}
</script>

<style scoped>
.cost-stats-card {
  background: linear-gradient(
    135deg,
    rgba(249, 115, 22, 0.08),
    rgba(249, 115, 22, 0.02)
  ) !important;
  border: 1px solid rgba(249, 115, 22, 0.2) !important;
  border-radius: 12px;
}
.cost-stats-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}
.cost-label {
  font-size: 0.78rem;
  color: rgb(148, 163, 184);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.cost-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 700;
  font-size: 1.05rem;
  margin-top: 2px;
}
.cost-value--avg {
  color: rgb(var(--v-theme-primary));
  font-size: 1.2rem;
}
.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
