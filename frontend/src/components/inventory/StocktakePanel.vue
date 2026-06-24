<template>
  <div>
    <!-- ═══ LIST MODE ═══ -->
    <template v-if="!current">
      <div class="d-flex align-center mb-3 flex-wrap gap-2">
        <div class="text-body-2 text-medium-emphasis">
          Đối chiếu tồn thực tế với hệ thống. Mỗi tháng nên kiểm 1 lần.
        </div>
        <v-spacer />
        <v-btn
          v-if="isAdmin"
          color="primary"
          prepend-icon="mdi-clipboard-check-outline"
          :loading="saving"
          @click="askCreate"
        >
          Tạo phiên kiểm kho
        </v-btn>
      </div>

      <!-- Loading -->
      <v-card v-if="loading && sessions.length === 0" variant="flat" rounded="xl" class="pa-4">
        <v-skeleton-loader type="table" />
      </v-card>

      <!-- Empty -->
      <v-card
        v-else-if="!loading && sessions.length === 0"
        variant="flat"
        rounded="xl"
        class="empty-state pa-8 text-center"
      >
        <v-icon size="80" color="grey-lighten-1" class="mb-4">mdi-clipboard-check-outline</v-icon>
        <div class="text-h6 mb-2">Chưa có phiên kiểm kho nào</div>
        <div class="text-body-2 text-medium-emphasis mb-4">
          Tạo phiên đầu tiên để đối chiếu tồn thực tế với hệ thống.
        </div>
        <v-btn v-if="isAdmin" color="primary" prepend-icon="mdi-plus" :loading="saving" @click="askCreate">
          Tạo phiên kiểm kho
        </v-btn>
      </v-card>

      <!-- Sessions table -->
      <v-card v-else variant="flat" rounded="xl">
        <v-table density="comfortable">
          <thead>
            <tr>
              <th>Mã phiên</th>
              <th>Ngày tạo</th>
              <th>Kho</th>
              <th class="text-right">Tiến độ đếm</th>
              <th class="text-right">Lệch SL</th>
              <th v-if="isAdmin" class="text-right">Giá trị lệch</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in sessions" :key="s.id" class="cursor-pointer st-row" @click="open(s.id)">
              <td class="font-mono font-weight-medium">{{ s.code }}</td>
              <td class="text-caption">{{ formatDate(s.createdAt) }}</td>
              <td class="text-caption">{{ s.warehouse?.name ?? '—' }}</td>
              <td class="text-right font-mono">{{ s.countedCount }} / {{ s.itemCount }}</td>
              <td class="text-right font-mono font-weight-bold" :class="varianceColor(s.varianceQty)">
                {{ signed(s.varianceQty) }}
              </td>
              <td v-if="isAdmin" class="text-right font-mono" :class="varianceColor(Number(s.varianceValue ?? 0))">
                {{ formatVND(s.varianceValue ?? 0) }}
              </td>
              <td>
                <v-chip :color="statusInfo(s.status).color" size="x-small" variant="tonal">
                  {{ statusInfo(s.status).text }}
                </v-chip>
              </td>
              <td><v-icon size="18" class="text-medium-emphasis">mdi-chevron-right</v-icon></td>
            </tr>
          </tbody>
        </v-table>
      </v-card>
    </template>

    <!-- ═══ DETAIL / COUNTING MODE ═══ -->
    <template v-else>
      <!-- Header -->
      <div class="d-flex align-center mb-3 flex-wrap gap-2">
        <v-btn variant="text" size="small" prepend-icon="mdi-arrow-left" @click="back">Danh sách phiên</v-btn>
        <div class="d-flex align-center gap-2">
          <span class="font-mono font-weight-bold text-h6">{{ current.code }}</span>
          <v-chip :color="statusInfo(current.status).color" size="small" variant="tonal">
            {{ statusInfo(current.status).text }}
          </v-chip>
        </div>
        <v-spacer />
        <span class="text-caption text-medium-emphasis">{{ current.warehouse?.name }}</span>
      </div>

      <!-- Summary -->
      <v-row dense class="mb-3">
        <v-col cols="6" sm="3">
          <v-card variant="flat" rounded="lg" class="kpi-card">
            <v-card-text class="pa-3">
              <div class="text-caption text-medium-emphasis">Đã đếm</div>
              <div class="text-h6 font-mono font-weight-bold mt-1">{{ countedNow }} / {{ editItems.length }}</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="6" sm="3">
          <v-card variant="flat" rounded="lg" class="kpi-card">
            <v-card-text class="pa-3">
              <div class="text-caption text-medium-emphasis">Số lô lệch</div>
              <div class="text-h6 font-mono font-weight-bold mt-1" :class="diffCount > 0 ? 'text-warning' : ''">
                {{ diffCount }}
              </div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="6" sm="3">
          <v-card variant="flat" rounded="lg" class="kpi-card">
            <v-card-text class="pa-3">
              <div class="text-caption text-medium-emphasis">Lệch tổng SL</div>
              <div class="text-h6 font-mono font-weight-bold mt-1" :class="varianceColor(totalVarianceQty)">
                {{ signed(totalVarianceQty) }}
              </div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col v-if="isAdmin" cols="6" sm="3">
          <v-card variant="flat" rounded="lg" class="kpi-card">
            <v-card-text class="pa-3">
              <div class="text-caption text-medium-emphasis">Giá trị lệch (cost)</div>
              <div class="text-subtitle-1 font-mono font-weight-bold mt-1" :class="varianceColor(totalVarianceValue)">
                {{ formatVND(totalVarianceValue) }}
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <v-alert
        v-if="editable"
        type="info"
        variant="tonal"
        density="compact"
        class="mb-3"
        icon="mdi-information-outline"
      >
        Nhập <strong>số đếm thực tế</strong> từng lô. Lô chưa nhập sẽ giữ nguyên tồn khi chốt.
        Khi chốt, hệ thống tự điều chỉnh tồn cho khớp số đếm + ghi audit log.
      </v-alert>

      <!-- Items table -->
      <v-card variant="flat" rounded="xl">
        <v-table density="comfortable" class="st-items-table">
          <thead>
            <tr>
              <th>Mã lô / SP</th>
              <th>HSD</th>
              <th class="text-right">Tồn hệ thống</th>
              <th class="text-right" style="width: 140px">Thực đếm</th>
              <th class="text-right">Lệch</th>
              <th v-if="isAdmin" class="text-right">Giá trị lệch</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="it in editItems" :key="it.id">
              <td>
                <div class="font-mono font-weight-medium">{{ it.batch?.batchCode }}</div>
                <div class="text-caption text-medium-emphasis">
                  {{ it.batch?.product?.name }}
                  <span class="font-mono ml-1">({{ it.batch?.product?.sku }})</span>
                </div>
              </td>
              <td class="text-caption">{{ formatDate(it.batch?.expiryDate) }}</td>
              <td class="text-right font-mono">{{ it.systemQty }}</td>
              <td class="text-right">
                <v-text-field
                  v-if="editable"
                  v-model="it.countedStr"
                  type="number"
                  density="compact"
                  variant="outlined"
                  hide-details
                  min="0"
                  class="count-input"
                  @update:model-value="dirty = true"
                />
                <span v-else class="font-mono">{{ it.countedQty ?? '—' }}</span>
              </td>
              <td class="text-right font-mono font-weight-bold" :class="varianceColor(liveVariance(it))">
                {{ signed(liveVariance(it)) }}
              </td>
              <td v-if="isAdmin" class="text-right font-mono" :class="varianceColor(liveVarianceValue(it))">
                {{ liveVariance(it) === null ? '—' : formatVND(liveVarianceValue(it)) }}
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card>

      <!-- Actions -->
      <div v-if="editable" class="d-flex flex-wrap gap-2 mt-3">
        <v-btn color="error" variant="text" prepend-icon="mdi-close-circle-outline" :loading="saving" @click="askCancel">
          Huỷ phiên
        </v-btn>
        <v-spacer />
        <v-btn variant="tonal" prepend-icon="mdi-content-save-outline" :loading="saving" @click="saveDraft">
          Lưu nháp
        </v-btn>
        <v-btn color="primary" prepend-icon="mdi-check-bold" :loading="saving" @click="askComplete">
          Chốt phiên
        </v-btn>
      </div>
    </template>

    <!-- Create confirm -->
    <v-dialog v-model="createDialog" max-width="460">
      <v-card>
        <v-card-title>Tạo phiên kiểm kho mới?</v-card-title>
        <v-card-text>
          <v-alert type="info" variant="tonal" density="compact" class="mb-3">
            Hệ thống sẽ chụp toàn bộ lô đang bán + số tồn hiện tại để bạn đếm thực tế.
          </v-alert>
          <v-textarea v-model="createNote" label="Ghi chú (tuỳ chọn)" rows="2" hide-details />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="createDialog = false">Bỏ qua</v-btn>
          <v-btn color="primary" :loading="saving" @click="doCreate">Tạo phiên</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Complete confirm -->
    <v-dialog v-model="completeDialog" max-width="480">
      <v-card>
        <v-card-title>Chốt phiên {{ current?.code }}?</v-card-title>
        <v-card-text>
          <v-alert type="warning" variant="tonal" density="compact" class="mb-2">
            Sau khi chốt: tồn các lô lệch sẽ được điều chỉnh cho khớp số đếm và ghi vào audit log.
            Phiên sẽ khoá lại, không sửa được nữa.
          </v-alert>
          <div class="text-body-2">
            • Số lô đã đếm: <strong>{{ countedNow }} / {{ editItems.length }}</strong><br />
            • Số lô sẽ được điều chỉnh: <strong>{{ diffCount }}</strong><br />
            <span v-if="isAdmin">• Giá trị lệch: <strong :class="varianceColor(totalVarianceValue)">{{ formatVND(totalVarianceValue) }}</strong></span>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="completeDialog = false">Bỏ qua</v-btn>
          <v-btn color="primary" :loading="saving" @click="doComplete">Xác nhận chốt</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Cancel confirm -->
    <v-dialog v-model="cancelDialog" max-width="420">
      <v-card>
        <v-card-title>Huỷ phiên {{ current?.code }}?</v-card-title>
        <v-card-text>
          <v-alert type="warning" variant="tonal" density="compact">
            Phiên sẽ bị huỷ. Tồn kho KHÔNG bị thay đổi. Số đếm đã nhập sẽ mất.
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="cancelDialog = false">Bỏ qua</v-btn>
          <v-btn color="error" :loading="saving" @click="doCancel">Huỷ phiên</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" :timeout="3500">{{ snack.text }}</v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { formatVND, formatDate } from '@/composables/use-inventory';
import {
  useStocktake,
  statusInfo,
  type StocktakeSession,
  type StocktakeItem,
} from '@/composables/use-stocktake';

const authStore = useAuthStore();
const isAdmin = computed(() => {
  const r = authStore.user?.role ?? '';
  return r === 'owner' || r === 'admin';
});

const {
  sessions,
  loading,
  saving,
  fetchSessions,
  fetchSession,
  createSession,
  saveCounts,
  completeSession,
  cancelSession,
} = useStocktake();

const current = ref<StocktakeSession | null>(null);
const dirty = ref(false);

// Editable copy of items with a string-bound count field.
interface EditItem extends StocktakeItem {
  countedStr: string;
}
const editItems = ref<EditItem[]>([]);

const editable = computed(() => isAdmin.value && current.value?.status === 'counting');

function parseCount(s: string): number | null {
  if (s === '' || s === null || s === undefined) return null;
  const n = Math.round(Number(s));
  if (Number.isNaN(n)) return null;
  return n < 0 ? 0 : n;
}

/** Variance vs the LIVE system stock (systemQty snapshot). null if not counted. */
function liveVariance(it: EditItem): number | null {
  const c = parseCount(it.countedStr);
  if (c === null) return null;
  return c - it.systemQty;
}
function liveVarianceValue(it: EditItem): number {
  const v = liveVariance(it);
  if (v === null) return 0;
  return v * Number(it.unitCost ?? 0);
}

const countedNow = computed(() => editItems.value.filter((it) => parseCount(it.countedStr) !== null).length);
const diffCount = computed(() => editItems.value.filter((it) => {
  const v = liveVariance(it);
  return v !== null && v !== 0;
}).length);
const totalVarianceQty = computed(() =>
  editItems.value.reduce((acc, it) => acc + (liveVariance(it) ?? 0), 0),
);
const totalVarianceValue = computed(() =>
  editItems.value.reduce((acc, it) => acc + liveVarianceValue(it), 0),
);

function signed(n: number | null): string {
  if (n === null) return '—';
  return n > 0 ? `+${n}` : `${n}`;
}
function varianceColor(n: number | null): string {
  if (n === null) return '';
  if (n > 0) return 'text-success';
  if (n < 0) return 'text-error';
  return '';
}

async function open(id: string) {
  const s = await fetchSession(id);
  if (!s) {
    showSnack('Không tải được phiên', 'error');
    return;
  }
  current.value = s;
  editItems.value = (s.items ?? []).map((it) => ({
    ...it,
    countedStr: it.countedQty === null || it.countedQty === undefined ? '' : String(it.countedQty),
  }));
  dirty.value = false;
}

function back() {
  current.value = null;
  editItems.value = [];
  dirty.value = false;
  fetchSessions();
}

// ── Create ─────────────────────────────────────────────────────────
const createDialog = ref(false);
const createNote = ref('');
function askCreate() {
  createNote.value = '';
  createDialog.value = true;
}
async function doCreate() {
  try {
    const res = await createSession({ note: createNote.value.trim() || undefined });
    createDialog.value = false;
    showSnack(`Đã tạo phiên ${res.code}`, 'success');
    await open(res.id);
  } catch (err: any) {
    showSnack(err?.message ?? 'Tạo phiên thất bại', 'error');
  }
}

// ── Save draft ─────────────────────────────────────────────────────
function countsPayload() {
  return editItems.value.map((it) => ({ id: it.id, countedQty: parseCount(it.countedStr) }));
}
async function saveDraft() {
  if (!current.value) return;
  try {
    await saveCounts(current.value.id, countsPayload());
    dirty.value = false;
    showSnack('Đã lưu nháp', 'success');
  } catch (err: any) {
    showSnack(err?.message ?? 'Lưu thất bại', 'error');
  }
}

// ── Complete ───────────────────────────────────────────────────────
const completeDialog = ref(false);
function askComplete() {
  completeDialog.value = true;
}
async function doComplete() {
  if (!current.value) return;
  try {
    // Persist current edits first so the backend applies the latest counts.
    await saveCounts(current.value.id, countsPayload());
    const res = await completeSession(current.value.id);
    completeDialog.value = false;
    showSnack(`Đã chốt phiên — điều chỉnh ${res.adjusted} sản phẩm`, 'success');
    back();
  } catch (err: any) {
    showSnack(err?.message ?? 'Chốt phiên thất bại', 'error');
  }
}

// ── Cancel ─────────────────────────────────────────────────────────
const cancelDialog = ref(false);
function askCancel() {
  cancelDialog.value = true;
}
async function doCancel() {
  if (!current.value) return;
  try {
    await cancelSession(current.value.id);
    cancelDialog.value = false;
    showSnack('Đã huỷ phiên', 'info');
    back();
  } catch (err: any) {
    showSnack(err?.message ?? 'Huỷ phiên thất bại', 'error');
  }
}

const snack = reactive<{ show: boolean; text: string; color: string }>({ show: false, text: '', color: 'success' });
function showSnack(text: string, color: 'success' | 'error' | 'info' = 'success') {
  snack.text = text;
  snack.color = color;
  snack.show = true;
}

// Expose a way for the parent to trigger "create" from the header button.
defineExpose({ askCreate, hasOpenDetail: computed(() => !!current.value) });

onMounted(fetchSessions);
</script>

<style scoped>
.gap-2 { gap: 8px; }
.kpi-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.empty-state { border: 1px dashed rgba(255, 255, 255, 0.18); }
.font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.cursor-pointer { cursor: pointer; }
.st-row:hover { background: rgba(255, 255, 255, 0.04); }
.count-input { max-width: 120px; margin-left: auto; }
.count-input :deep(input) { text-align: right; }
</style>
