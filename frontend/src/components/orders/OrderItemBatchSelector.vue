<script setup lang="ts">
import { computed, ref } from 'vue';
import { api } from '@/api/index';
import { useAuthStore } from '@/stores/auth';
import { batchDate, itemBatchLines } from '@/composables/use-item-batches';
import type { Order, OrderItem } from '@/composables/use-orders';
const props = defineProps<{ order: Order; item: OrderItem }>();
const emit = defineEmits(['saved']);
const auth = useAuthStore();
const opened = ref(false);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const batches = ref<Array<{id: string; batchCode: string; expiryDate: string | null; availableQuantity: number}>>([]);
const selected = ref('');
const reason = ref('');
const allowed = ref(false);
const blockedReason = ref('');
const status = computed(() => props.order.statusNormalized || props.order.status);
const postStock = computed(() => ['packing', 'shipping', 'completed'].includes(status.value));
const canOpen = computed(() => props.item.productId && (['draft', 'confirmed'].includes(status.value) || (postStock.value && (['owner', 'admin'].includes(auth.user?.role || '') || auth.user?.canManageImports))));
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
  } catch (err: any) {
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
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Không lưu được lô. Vui lòng kiểm tra lại tồn kho.';
  } finally { saving.value = false; }
}
</script>
<template>
  <div class="text-caption text-medium-emphasis mt-1">
    <div v-for="line in lines" :key="line">{{ line }}</div>
    <div v-if="!lines.length">Chưa chọn lô / HSD</div>
    <v-btn v-if="canOpen" size="small" variant="text" color="primary" @click="open">Chọn / sửa lô và HSD</v-btn>
    <v-dialog v-model="opened" max-width="580" :persistent="saving">
      <v-card title="Chọn lô và hạn dùng">
        <v-card-text>
          <p class="mb-2">{{ item.productName }} · {{ item.quantity }} {{ item.unit }}</p>
          <div v-for="line in lines" :key="line" class="text-caption">{{ line }}</div>
          <v-progress-linear v-if="loading" indeterminate class="my-3" />
          <v-alert v-if="error" type="error" variant="tonal" class="my-3">{{ error }}</v-alert>
          <template v-if="!loading && (!error || allowed)">
            <v-alert v-if="!allowed" type="warning" variant="tonal" class="mt-3">{{ blockedReason }}</v-alert>
            <template v-else>
              <v-alert v-if="postStock" type="warning" variant="tonal" class="my-3">Đơn đã xuất kho: lưu sẽ hoàn số lượng về lô cũ và trừ ở lô mới. Chỉ chọn lô đúng với hàng thực tế đã giao; lịch sử thay đổi được lưu lại.</v-alert>
              <v-alert v-if="!eligible.length" type="info" variant="tonal" class="my-3">Không có lô đủ số lượng để chuyển toàn bộ dòng hàng này.</v-alert>
              <v-select v-model="selected" label="Lô hàng / Hạn dùng" class="mt-4" :items="batches.map(b => ({ title: `${b.batchCode} · HSD ${batchDate(b.expiryDate)} · Có thể dùng ${b.availableQuantity}`, value: b.id, props: { disabled: Number(b.availableQuantity) < Number(item.quantity) } }))" :disabled="saving || !eligible.length" />
              <p class="text-caption mb-3">Hạn dùng lấy từ lô trong kho. Mỗi lần chọn áp dụng cho toàn bộ {{ item.quantity }} sản phẩm của dòng này.</p>
              <v-textarea v-model="reason" label="Lý do thay đổi *" :disabled="saving" maxlength="500" rows="2" placeholder="VD: Cập nhật đúng lô thực tế giao cho khách" />
            </template>
          </template>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn :disabled="saving" @click="opened = false">Đóng</v-btn>
          <v-btn v-if="error && !allowed" @click="open">Thử lại</v-btn>
          <v-btn v-if="allowed" color="primary" :loading="saving" :disabled="loading || !selected || !reason.trim() || !eligible.some(b => b.id === selected)" @click="save">Lưu lô / HSD</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
