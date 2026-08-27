<script setup>
import { ref, watch } from 'vue';

/**
 * Ô nhập SỐ TIỀN / SỐ LƯỢNG theo cách gõ của người Việt.
 *
 * Vì sao có component này (27/8/2026): các ô tiền trong app đang dùng
 * `type="number"` + `parseInt`. Gõ "94.250" kiểu Việt thì `parseInt("94.250")`
 * = 94 → giá vốn/đơn giá thành 94đ, kéo sai cả công nợ, registry giá vốn và
 * lãi gộp. Đây là bài học đã ghi trong bộ não dự án.
 *
 * Cách làm (giống ô "Giá trị hoá đơn" ở VatConfirmDialog.vue — đã chạy thật):
 *  - ô là `type="text" inputmode="numeric"` → bàn phím số, nhưng KHÔNG bị
 *    trình duyệt tự hiểu dấu chấm là phần thập phân;
 *  - lấy giá trị = tất cả CHỮ SỐ trong ô ("94.250" → 94250);
 *  - rời ô thì format lại có dấu phân cách để đọc ("94.250").
 *
 * Component nhả ra SỐ NGUYÊN (v-model là number) nên nơi dùng không phải
 * đổi logic tính tiền.
 */
const props = defineProps({
  modelValue: { type: [Number, String], default: 0 },
  /** Giá trị nhỏ nhất sau khi làm sạch: tiền = 0, số lượng = 1. */
  min: { type: Number, default: 0 },
});
const emit = defineEmits(['update:modelValue']);

const text = ref('');
const editing = ref(false);

/** Lấy số nguyên từ chuỗi người dùng gõ: bỏ mọi ký tự không phải chữ số. */
function toNumber(s) {
  return Number(String(s).replace(/[^\d]/g, '')) || 0;
}
function toText(n) {
  const v = Number(n) || 0;
  return v ? v.toLocaleString('vi-VN') : '';
}

// Giá trị đổi từ BÊN NGOÀI (bấm +/− số lượng, đổi bậc giá, nạp lại đơn cũ…)
// thì cập nhật ô — nhưng không giành con trỏ khi người dùng đang gõ.
watch(
  () => props.modelValue,
  (v) => {
    if (editing.value) return;
    text.value = toText(v);
  },
  { immediate: true },
);

function onInput(e) {
  const raw = e.target.value;
  // Giữ nguyên những gì đang gõ (chỉ lọc ký tự lạ) để con trỏ không nhảy về đầu.
  text.value = raw.replace(/[^\d.,\s]/g, '');
  emit('update:modelValue', Math.max(props.min, toNumber(raw)));
}

function onFocus() {
  editing.value = true;
  // Bỏ dấu phân cách khi bắt đầu sửa cho dễ gõ lại từ đầu.
  const n = Number(props.modelValue) || 0;
  text.value = n ? String(Math.round(n)) : '';
}

function onBlur() {
  editing.value = false;
  const n = Math.max(props.min, toNumber(text.value));
  text.value = toText(n);
  emit('update:modelValue', n);
}
</script>

<template>
  <!-- class / placeholder / disabled… truyền thẳng từ nơi dùng (fallthrough attrs) -->
  <input
    :value="text"
    @input="onInput"
    @focus="onFocus"
    @blur="onBlur"
    type="text"
    inputmode="numeric"
    autocomplete="off"
  />
</template>
