<template>
  <div>
    <div class="d-flex align-center mb-4">
      <span class="text-h6">Mã API cho nhân viên</span>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">Cấp mã mới</v-btn>
    </div>

    <v-alert type="info" variant="tonal" density="comfortable" class="mb-4">
      Mã API cho nhân viên tự viết app riêng gọi vào CRM. Mỗi mã <strong>chỉ đọc được
      khách hàng được gán cho đúng nhân viên đó</strong> — không thấy khách của người khác,
      không thấy giá vốn/lãi gộp. Nghi mã bị lộ thì bấm <strong>Thu hồi</strong>, mã mất hiệu lực ngay.
    </v-alert>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4" closable @click:close="error = ''">
      {{ error }}
    </v-alert>

    <v-card>
      <v-data-table
        :headers="headers"
        :items="apiKeys"
        :loading="loading"
        no-data-text="Chưa cấp mã API nào"
      >
        <template #item.user="{ item }">
          <div>{{ item.user.fullName }}</div>
          <div class="text-caption text-medium-emphasis">{{ item.user.email }}</div>
        </template>
        <template #item.keyPrefix="{ item }">
          <code class="text-caption">halo_{{ item.keyPrefix }}…</code>
        </template>
        <template #item.scope="{ item }">
          <v-chip size="small" variant="tonal">{{ scopeLabel(item.scope) }}</v-chip>
        </template>
        <template #item.lastUsedAt="{ item }">
          {{ item.lastUsedAt ? formatDateTime(item.lastUsedAt) : 'Chưa dùng' }}
        </template>
        <template #item.status="{ item }">
          <v-chip :color="item.revokedAt ? 'error' : 'success'" size="small" variant="flat">
            {{ item.revokedAt ? 'Đã thu hồi' : 'Đang hoạt động' }}
          </v-chip>
        </template>
        <template #item.actions="{ item }">
          <v-btn
            v-if="!item.revokedAt"
            icon
            size="small"
            color="error"
            variant="text"
            title="Thu hồi mã"
            @click="confirmRevoke(item)"
          >
            <v-icon>mdi-key-remove</v-icon>
          </v-btn>
        </template>
      </v-data-table>
    </v-card>

    <!-- Cấp mã mới -->
    <v-dialog v-model="showCreate" max-width="480">
      <v-card>
        <v-card-title>Cấp mã API mới</v-card-title>
        <v-card-text>
          <v-select
            v-model="form.userId"
            :items="activeUsers"
            item-title="fullName"
            item-value="id"
            label="Cấp cho nhân viên *"
            class="mb-2"
          />
          <v-text-field
            v-model="form.name"
            label="Tên mã *"
            placeholder="VD: App khách hàng của Đức"
            counter="60"
            maxlength="60"
            hint="Đặt tên để sau này biết mã này của app nào"
            persistent-hint
          />
          <v-alert type="warning" variant="tonal" density="compact" class="mt-3">
            Mã cấp ra <strong>chỉ hiện 1 lần</strong>. Nhân viên nhận mã sẽ đọc được
            danh sách khách + đơn hàng của chính họ qua app riêng.
          </v-alert>
          <v-alert v-if="dialogError" type="error" density="compact" class="mt-2">{{ dialogError }}</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showCreate = false">Hủy</v-btn>
          <v-btn color="primary" :loading="saving" @click="handleCreate">Cấp mã</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Hiện mã 1 lần -->
    <v-dialog v-model="showGeneratedKey" max-width="560" persistent>
      <v-card>
        <v-card-title class="text-warning">
          <v-icon class="mr-2">mdi-key-variant</v-icon>
          Mã API mới
        </v-card-title>
        <v-card-text>
          <p class="mb-2">Mã API của <strong>{{ generatedForName }}</strong>:</p>
          <div class="d-flex align-center gap-2">
            <v-text-field
              :model-value="generatedKey"
              readonly
              hide-details
              variant="outlined"
              density="comfortable"
              bg-color="surface-light"
            />
            <v-btn
              :color="copied ? 'success' : 'primary'"
              :prepend-icon="copied ? 'mdi-check' : 'mdi-content-copy'"
              @click="copyKey"
            >
              {{ copied ? 'Đã copy' : 'Copy' }}
            </v-btn>
          </div>
          <v-alert type="warning" variant="tonal" density="compact" class="mt-3">
            <strong>Mã chỉ hiện 1 lần.</strong> Copy gửi cho nhân viên qua Zalo ngay.
            Đóng cửa sổ này là không xem lại được — mất thì thu hồi rồi cấp mã mới.
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="primary" @click="closeGeneratedKey">Đã copy, đóng</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Xác nhận thu hồi -->
    <v-dialog v-model="showRevokeConfirm" max-width="440">
      <v-card>
        <v-card-title>Thu hồi mã API</v-card-title>
        <v-card-text>
          Thu hồi mã <strong>{{ selectedKey?.name }}</strong> của
          <strong>{{ selectedKey?.user.fullName }}</strong>?
          <br /><br />
          App đang dùng mã này sẽ <strong>ngừng hoạt động ngay</strong>. Không hoàn tác được —
          muốn dùng lại phải cấp mã mới.
          <v-alert v-if="dialogError" type="error" density="compact" class="mt-2">{{ dialogError }}</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showRevokeConfirm = false">Hủy</v-btn>
          <v-btn color="error" :loading="saving" @click="handleRevoke">Thu hồi</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useApiKeys, type ApiKeyRow } from '@/composables/use-api-keys';
import { useUsers } from '@/composables/use-users';

const { apiKeys, loading, error, fetchApiKeys, createApiKey, revokeApiKey } = useApiKeys();
const { users, fetchUsers } = useUsers();

const showCreate = ref(false);
const showGeneratedKey = ref(false);
const showRevokeConfirm = ref(false);
const saving = ref(false);
const dialogError = ref('');
const copied = ref(false);
const generatedKey = ref('');
const generatedForName = ref('');
const selectedKey = ref<ApiKeyRow | null>(null);
const form = ref({ userId: '', name: '' });

const activeUsers = computed(() => users.value.filter((u) => u.isActive));

const headers = [
  { title: 'Tên mã', key: 'name' },
  { title: 'Cấp cho', key: 'user', sortable: false },
  { title: 'Mã (8 ký tự đầu)', key: 'keyPrefix', sortable: false },
  { title: 'Quyền', key: 'scope' },
  { title: 'Lần dùng cuối', key: 'lastUsedAt' },
  { title: 'Trạng thái', key: 'status', sortable: false },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
];

function scopeLabel(scope: string) {
  return scope === 'own_customers_write' ? 'Đọc + ghi khách của mình' : 'Chỉ đọc khách của mình';
}

function formatDateTime(iso: string) {
  // Giờ Việt Nam — mọi mốc thời gian trong dự án đều theo Asia/Ho_Chi_Minh.
  return new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function openCreate() {
  form.value = { userId: '', name: '' };
  dialogError.value = '';
  showCreate.value = true;
}

async function handleCreate() {
  if (!form.value.userId) { dialogError.value = 'Chưa chọn nhân viên'; return; }
  if (!form.value.name.trim()) { dialogError.value = 'Chưa đặt tên mã'; return; }
  saving.value = true;
  dialogError.value = '';
  const res = await createApiKey({ userId: form.value.userId, name: form.value.name.trim() });
  saving.value = false;
  if (res.ok && res.key) {
    generatedKey.value = res.key;
    generatedForName.value = res.userFullName || '';
    copied.value = false;
    showCreate.value = false;
    showGeneratedKey.value = true;
  } else {
    dialogError.value = res.error || 'Cấp mã thất bại';
  }
}

async function copyKey() {
  try {
    await navigator.clipboard.writeText(generatedKey.value);
    copied.value = true;
  } catch {
    copied.value = false;
  }
}

function closeGeneratedKey() {
  showGeneratedKey.value = false;
  // Xoá khỏi memory ngay để DevTools không đọc lại được.
  generatedKey.value = '';
  generatedForName.value = '';
}

function confirmRevoke(key: ApiKeyRow) {
  selectedKey.value = key;
  dialogError.value = '';
  showRevokeConfirm.value = true;
}

async function handleRevoke() {
  if (!selectedKey.value) return;
  saving.value = true;
  const res = await revokeApiKey(selectedKey.value.id);
  saving.value = false;
  if (res.ok) {
    showRevokeConfirm.value = false;
  } else {
    dialogError.value = res.error || 'Thu hồi thất bại';
  }
}

onMounted(async () => {
  await Promise.all([fetchApiKeys(), fetchUsers()]);
});
</script>
