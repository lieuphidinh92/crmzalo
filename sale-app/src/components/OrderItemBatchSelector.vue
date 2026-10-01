<script setup>
import { computed, ref } from 'vue';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { batchDate, itemBatchLines } from '../composables/useItemBatches';
const props = defineProps({ order: { type: Object, required: true }, item: { type: Object, required: true } });
const emit = defineEmits(['saved']);
const auth = useAuthStore();
const opened = ref(false);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const batches = ref([]);
const selected = ref('');
const reason = ref('');
const allowed = ref(false);
const blockedReason = ref('');
const status = computed(() => props.order.statusNormalized || props.order.status);
const postStock = computed(() => ['packing', 'shipping', 'completed'].includes(status.value));
const canOpen = computed(() => props.item.productId && (['draft', 'confirmed'].includes(status.value) || (postStock.value && (['owner', 'admin'].includes(auth.user?.role) || auth.user?.canManageImports))));
const lines = computed(() => itemBatchLines(props.item));
const eligible = computed(() => batches.value.filter(b => Number(b.availableQuantity) >= Number(props.item.quantity)));
async function open() {
  opened.value = true;
  loading.value = true;
  error.value = '';
  reason.value = '';
  batches.value = [];
  allowed.value = false;
  try {
    const { data } = await api.get(`/orders/${props.order.id}/items/${props.item.id}/batches`);
    batches.value = data.batches || [];
    selected.value = data.selectedBatchId || '';
    allowed.value = data.canEdit === true;
    blockedReason.value = data.reason || 'Đơn hàng này chưa thể đổi lô.';
  } catch (err) {
    error.value = err.response?.data?.error || 'Không tải được danh sách lô. Vui lòng thử lại.';
  } finally { loading.value = false; }
}
async function save() {
  if (!allowed.value || !selected.value || !reason.value.trim() || saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    await api.put(`/orders/${props.order.id}/items/${props.item.id}/batch`, { batchId: selected.value, reason: reason.value.trim() });
    opened.value = false;
    emit('saved');
  } catch (err) {
    error.value = err.response?.data?.error || 'Không lưu được lô. Vui lòng kiểm tra lại tồn kho.';
  } finally { saving.value = false; }
}
</script>
<template>
  <div class="mt-1 text-xs text-ink-secondary">
    <div v-for="line in lines" :key="line">{{ line }}</div>
    <div v-if="!lines.length">Chưa chọn lô / HSD</div>
    <button v-if="canOpen" type="button" class="mt-1 min-h-9 text-royal-700 font-semibold underline" @click="open">Chọn / sửa lô và HSD</button>
    <Teleport to="body">
      <div v-if="opened" class="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Chọn lô và hạn dùng">
        <div class="bg-white rounded-2xl w-full max-w-lg p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
          <h3 class="text-lg font-bold text-ink-primary">Chọn lô và hạn dùng</h3>
          <p class="text-sm my-2">{{ item.productName }} · {{ item.quantity }} {{ item.unit }}</p>
          <div class="text-xs mb-3" v-for="line in lines" :key="line">{{ line }}</div>
          <p v-if="loading" role="status">Đang tải lô tồn kho…</p>
          <div v-if="error" role="alert" class="text-red-700 bg-red-50 p-3 rounded-lg my-3">{{ error }}</div>
          <template v-if="!loading && (!error || allowed)">
            <p v-if="!allowed" class="text-amber-700">{{ blockedReason }}</p>
            <template v-else>
              <p v-if="postStock" class="bg-amber-50 text-amber-800 p-3 rounded-lg mb-3">Đơn đã xuất kho: lưu sẽ hoàn số lượng về lô cũ và trừ ở lô mới. Chỉ chọn lô đúng với hàng thực tế đã giao; lịch sử thay đổi được lưu lại.</p>
              <p v-if="!eligible.length" class="text-amber-700">Không có lô đủ số lượng để chuyển toàn bộ dòng hàng này.</p>
              <label class="block text-sm font-semibold mb-1">Lô hàng / Hạn dùng</label>
              <select v-model="selected" class="w-full border rounded-lg p-3 text-sm" :disabled="saving || !eligible.length">
                <option value="" disabled>Chọn lô có sẵn</option>
                <option v-for="b in batches" :key="b.id" :value="b.id" :disabled="Number(b.availableQuantity) < Number(item.quantity)">{{ b.batchCode }} · HSD {{ batchDate(b.expiryDate) }} · Có thể dùng {{ b.availableQuantity }}</option>
              </select>
              <p class="text-xs mt-2">Hạn dùng lấy từ lô trong kho. Mỗi lần chọn áp dụng cho toàn bộ {{ item.quantity }} sản phẩm của dòng này.</p>
              <label class="block text-sm font-semibold mt-3 mb-1">Lý do thay đổi *</label>
              <textarea v-model="reason" :disabled="saving" maxlength="500" rows="2" class="w-full border rounded-lg p-3" placeholder="VD: Cập nhật đúng lô thực tế giao cho khách" />
            </template>
          </template>
          <div class="flex gap-2 mt-4">
            <button type="button" :disabled="saving" @click="opened = false" class="flex-1 border rounded-xl p-3">Đóng</button>
            <button v-if="error && !allowed" type="button" @click="open" class="flex-1 border rounded-xl p-3">Thử lại</button>
            <button v-if="allowed" type="button" :disabled="saving || loading || !selected || !reason.trim() || !eligible.some(b => b.id === selected)" @click="save" class="flex-1 bg-royal-700 text-white rounded-xl p-3 disabled:opacity-40">{{ saving ? 'Đang lưu…' : 'Lưu lô / HSD' }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
