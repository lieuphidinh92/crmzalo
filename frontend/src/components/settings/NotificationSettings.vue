<template>
  <div>
    <div class="d-flex align-center mb-4">
      <span class="text-h6">Thông báo tự động</span>
      <v-spacer />
      <v-btn
        color="primary"
        variant="tonal"
        prepend-icon="mdi-send-check"
        :loading="testing"
        @click="onSendTest"
      >
        Gửi thử
      </v-btn>
    </div>

    <v-alert type="info" variant="tonal" density="comfortable" class="mb-4">
      Hệ thống nhắc kế toán lúc <strong>10:00</strong> và <strong>16:00</strong> mỗi ngày khi còn
      yêu cầu xuất hoá đơn VAT đang chờ. <strong>Không có yêu cầu nào chờ thì không gửi gì</strong>.
      Bấm <strong>Gửi thử</strong> để kiểm tra ngay — lúc hàng chờ trống, tin gửi đi sẽ mang nhãn
      <strong>[THỬ NGHIỆM]</strong> kèm số liệu giả.
    </v-alert>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4" closable @click:close="error = ''">
      {{ error }}
    </v-alert>
    <v-alert v-if="ketQuaGuiThu" type="success" variant="tonal" class="mb-4" closable @click:close="ketQuaGuiThu = ''">
      Đã gửi thử — {{ ketQuaGuiThu }}
    </v-alert>

    <!-- Khung cấu hình từng nhóm người nhận -->
    <template v-if="loading && audiences.length === 0">
      <v-skeleton-loader type="card" class="mb-4" />
    </template>

    <v-card v-for="nhom in audiences" :key="nhom.audience" class="mb-4">
      <v-card-title class="text-subtitle-1">{{ nhom.nhan }}</v-card-title>
      <v-divider />
      <v-list lines="two">
        <v-list-item v-for="kenh in nhom.channels" :key="kenh.channel">
          <template #prepend>
            <v-icon :icon="kenh.channel === 'lark' ? 'mdi-forum' : 'mdi-email-outline'" />
          </template>

          <v-list-item-title>{{ tenKenh(kenh.channel) }}</v-list-item-title>
          <v-list-item-subtitle>
            <span v-if="kenh.sanSang" class="text-success">Đã đủ cấu hình để gửi</span>
            <span v-else class="text-warning">{{ kenh.lyDo }}</span>
          </v-list-item-subtitle>

          <template #append>
            <v-chip v-if="kenh.batTat && !kenh.sanSang" color="warning" size="small" variant="tonal" class="mr-3">
              Bật nhưng chưa gửi được
            </v-chip>
            <v-switch
              :model-value="kenh.batTat"
              color="primary"
              hide-details
              density="compact"
              :loading="dangLuu === `${nhom.audience}.${kenh.channel}`"
              @update:model-value="(val) => onToggle(nhom.audience, kenh.channel, val === true)"
            />
          </template>
        </v-list-item>
      </v-list>
    </v-card>

    <!-- Nhật ký gửi -->
    <v-card>
      <v-card-title class="text-subtitle-1">Nhật ký gửi gần đây</v-card-title>
      <v-divider />
      <v-data-table
        :headers="headers"
        :items="logs"
        :loading="loading"
        density="comfortable"
        no-data-text="Chưa gửi thông báo nào"
      >
        <template #item.channel="{ item }">{{ tenKenh(item.channel) }}</template>
        <template #item.status="{ item }">
          <v-chip :color="mauTrangThai(item.status)" size="small" variant="flat">
            {{ trangThai(item.status) }}
          </v-chip>
          <div v-if="item.lastError" class="text-caption text-medium-emphasis mt-1">
            {{ item.lastError }}
          </div>
        </template>
        <template #item.attempts="{ item }">
          {{ item.attempts }}{{ item.attempts > 1 ? ' lần' : '' }}
        </template>
        <template #item.createdAt="{ item }">
          {{ formatDateTime(item.sentAt || item.createdAt) }}
        </template>
      </v-data-table>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  useNotificationSettings,
  tenKenh,
  trangThai,
} from '@/composables/use-notification-settings';

const { audiences, logs, loading, error, fetchSettings, toggleChannel, sendTest } =
  useNotificationSettings();

const testing = ref(false);
const ketQuaGuiThu = ref('');
/** Khoá "<nhóm>.<kênh>" đang lưu — để quay vòng đúng 1 công tắc. */
const dangLuu = ref('');

const headers = [
  { title: 'Nội dung', key: 'title' },
  { title: 'Kênh', key: 'channel', width: 120 },
  { title: 'Trạng thái', key: 'status', width: 220 },
  { title: 'Số lần gửi', key: 'attempts', width: 120 },
  { title: 'Thời điểm', key: 'createdAt', width: 200 },
];

function mauTrangThai(status: string): string {
  if (status === 'sent') return 'success';
  if (status === 'failed') return 'error';
  return 'grey';
}

function formatDateTime(iso: string) {
  // Giờ Việt Nam — mọi mốc thời gian trong dự án đều theo Asia/Ho_Chi_Minh.
  return new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

async function onToggle(audience: string, channel: string, enabled: boolean) {
  dangLuu.value = `${audience}.${channel}`;
  const res = await toggleChannel(audience, channel, enabled);
  dangLuu.value = '';
  if (!res.ok) {
    error.value = res.error ?? 'Lỗi lưu cấu hình';
    await fetchSettings(); // trả công tắc về đúng trạng thái thật trong DB
  }
}

async function onSendTest() {
  testing.value = true;
  ketQuaGuiThu.value = '';
  const res = await sendTest();
  testing.value = false;
  if (res.ok) ketQuaGuiThu.value = res.ketQua ?? '';
  else error.value = res.error ?? 'Lỗi gửi thử';
}

onMounted(fetchSettings);
</script>
