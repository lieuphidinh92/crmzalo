<template>
  <div>
    <h1 class="text-h4 mb-4">
      <v-icon class="mr-2" style="color: var(--brand-amber-500);">mdi-cog-outline</v-icon>
      Cài đặt
    </h1>

    <v-tabs v-model="tab" class="mb-4">
      <v-tab value="users">Nhân viên</v-tab>
      <v-tab value="teams">Đội nhóm</v-tab>
      <v-tab value="org">Tổ chức</v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <!-- Tab 1: User management -->
      <v-window-item value="users">
        <div class="d-flex align-center mb-4">
          <v-btn v-if="authStore.isAdmin" color="primary" prepend-icon="mdi-plus" @click="openCreate">
            Thêm nhân viên
          </v-btn>
        </div>

        <v-alert v-if="error" type="error" variant="tonal" class="mb-4" closable @click:close="error = ''">
          {{ error }}
        </v-alert>

        <v-card>
          <v-data-table :headers="headers" :items="users" :loading="loading" no-data-text="Chưa có nhân viên nào">
            <template #item.role="{ item }">
              <v-chip :color="roleColor(item.role)" size="small" variant="flat">{{ roleLabel(item.role) }}</v-chip>
            </template>
            <template #item.isActive="{ item }">
              <v-switch
                :model-value="item.isActive"
                :disabled="!authStore.isOwner || item.id === authStore.user?.id"
                color="success"
                density="compact"
                hide-details
                :label="item.isActive ? 'Hoạt động' : 'Đã nghỉ'"
                @update:model-value="(val: boolean | null) => toggleActive(item, val ?? false)"
              />
            </template>
            <template #item.actions="{ item }">
              <v-btn v-if="authStore.isAdmin" icon size="small" title="Chỉnh sửa" @click="openEdit(item)">
                <v-icon>mdi-pencil</v-icon>
              </v-btn>
              <v-btn
                v-if="authStore.isAdmin"
                icon
                size="small"
                title="Reset mật khẩu tự động (hiện 1 lần)"
                color="warning"
                @click="confirmAutoReset(item)"
              >
                <v-icon>mdi-lock-reset</v-icon>
              </v-btn>
            </template>
          </v-data-table>
        </v-card>

        <!-- Create dialog -->
        <v-dialog v-model="showCreate" max-width="440">
          <v-card>
            <v-card-title>Thêm nhân viên</v-card-title>
            <v-card-text>
              <v-text-field v-model="form.fullName" label="Họ tên *" class="mb-2" />
              <v-text-field v-model="form.email" label="Email *" type="email" class="mb-2" />
              <v-text-field v-model="form.password" label="Mật khẩu *" type="password" class="mb-2" />
              <v-select v-model="form.role" :items="roleOptions" item-title="label" item-value="value" label="Vai trò" />
              <v-alert v-if="dialogError" type="error" density="compact" class="mt-2">{{ dialogError }}</v-alert>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn @click="showCreate = false">Hủy</v-btn>
              <v-btn color="primary" :loading="saving" @click="handleCreate">Tạo</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Edit dialog: thêm field Mật khẩu (để trống = không đổi) -->
        <v-dialog v-model="showEdit" max-width="440">
          <v-card>
            <v-card-title>Chỉnh sửa nhân viên</v-card-title>
            <v-card-text>
              <v-text-field v-model="form.fullName" label="Họ tên" class="mb-2" />
              <v-text-field v-model="form.email" label="Email" type="email" class="mb-2" />
              <v-select v-if="authStore.isOwner" v-model="form.role" :items="roleOptions" item-title="label" item-value="value" label="Vai trò" class="mb-2" />
              <v-text-field
                v-model="form.password"
                label="Mật khẩu mới (để trống nếu không đổi)"
                type="password"
                hint="Min 6 ký tự. Để trống → giữ mật khẩu cũ."
                persistent-hint
                autocomplete="new-password"
              />
              <v-alert v-if="dialogError" type="error" density="compact" class="mt-2">{{ dialogError }}</v-alert>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn @click="showEdit = false">Hủy</v-btn>
              <v-btn color="primary" :loading="saving" @click="handleUpdate">Lưu</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Auto-reset confirm dialog -->
        <v-dialog v-model="showAutoResetConfirm" max-width="420">
          <v-card>
            <v-card-title>Xác nhận reset mật khẩu</v-card-title>
            <v-card-text>
              Hệ thống sẽ <strong>sinh mật khẩu mới ngẫu nhiên</strong> cho
              <strong>{{ selectedUser?.fullName }}</strong> ({{ selectedUser?.email }}).
              <br /><br />
              Mật khẩu cũ sẽ vô hiệu hoá ngay. Mật khẩu mới chỉ hiện <strong>1 lần</strong>
              ở màn hình tiếp theo — anh cần copy gửi cho nhân viên qua Zalo.
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn @click="showAutoResetConfirm = false">Hủy</v-btn>
              <v-btn color="warning" :loading="saving" @click="handleAutoReset">Reset & sinh mật khẩu</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Show generated password dialog -->
        <v-dialog v-model="showGeneratedPassword" max-width="460" persistent>
          <v-card>
            <v-card-title class="text-warning">
              <v-icon class="mr-2">mdi-key-variant</v-icon>
              Mật khẩu mới
            </v-card-title>
            <v-card-text>
              <p class="mb-2">
                Mật khẩu mới của <strong>{{ generatedUserEmail }}</strong>:
              </p>
              <div class="d-flex align-center gap-2">
                <v-text-field
                  :model-value="generatedPassword"
                  readonly
                  hide-details
                  variant="outlined"
                  density="comfortable"
                  class="font-mono"
                  bg-color="surface-light"
                />
                <v-btn
                  :color="copied ? 'success' : 'primary'"
                  :prepend-icon="copied ? 'mdi-check' : 'mdi-content-copy'"
                  @click="copyPassword"
                >
                  {{ copied ? 'Đã copy' : 'Copy' }}
                </v-btn>
              </div>
              <v-alert type="warning" variant="tonal" density="compact" class="mt-3">
                <strong>Mật khẩu chỉ hiện 1 lần.</strong> Hãy copy + gửi cho nhân viên ngay
                qua Zalo (KHÔNG gửi qua kênh dễ lộ). Đóng cửa sổ này → không xem lại được.
              </v-alert>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn color="primary" @click="closeGeneratedPassword">Đã copy, đóng</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>


      </v-window-item>

      <!-- Tab 2: Team management -->
      <v-window-item value="teams">
        <TeamManagement />
      </v-window-item>

      <!-- Tab 3: Organization settings -->
      <v-window-item value="org">
        <OrgSettings />
      </v-window-item>
    </v-window>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useUsers, type OrgUser } from '@/composables/use-users';
import { useAuthStore } from '@/stores/auth';
import TeamManagement from '@/components/settings/TeamManagement.vue';
import OrgSettings from '@/components/settings/OrgSettings.vue';

const { users, loading, error, fetchUsers, createUser, updateUser, resetPassword, autoResetPassword } = useUsers();
const authStore = useAuthStore();

const tab = ref('users');
const showCreate = ref(false);
const showEdit = ref(false);
const showAutoResetConfirm = ref(false);
const showGeneratedPassword = ref(false);
const saving = ref(false);
const dialogError = ref('');
const selectedUser = ref<OrgUser | null>(null);
const generatedPassword = ref('');
const generatedUserEmail = ref('');
const copied = ref(false);

const form = ref({ fullName: '', email: '', password: '', role: 'member' });

const roleOptions = [
  { label: 'Nhân viên', value: 'member' },
  { label: 'Quản trị viên', value: 'admin' },
];

const headers = [
  { title: 'Họ tên', key: 'fullName', sortable: true },
  { title: 'Email', key: 'email' },
  { title: 'Vai trò', key: 'role', sortable: true },
  { title: 'Trạng thái', key: 'isActive', sortable: true, width: 160 },
  { title: 'Hành động', key: 'actions', sortable: false, align: 'end' as const },
];

function roleColor(role: string) {
  if (role === 'owner') return 'primary';
  if (role === 'admin') return 'info';
  return 'default';
}

function roleLabel(role: string) {
  if (role === 'owner') return 'Chủ sở hữu';
  if (role === 'admin') return 'Quản trị viên';
  return 'Nhân viên';
}

function openCreate() {
  form.value = { fullName: '', email: '', password: '', role: 'member' };
  dialogError.value = '';
  showCreate.value = true;
}

function openEdit(user: OrgUser) {
  selectedUser.value = user;
  form.value = { fullName: user.fullName, email: user.email, password: '', role: user.role };
  dialogError.value = '';
  showEdit.value = true;
}

function confirmAutoReset(user: OrgUser) {
  selectedUser.value = user;
  dialogError.value = '';
  showAutoResetConfirm.value = true;
}

async function handleAutoReset() {
  if (!selectedUser.value) return;
  saving.value = true;
  const res = await autoResetPassword(selectedUser.value.id);
  saving.value = false;
  if (res.ok && res.newPassword) {
    generatedPassword.value = res.newPassword;
    generatedUserEmail.value = res.userEmail || selectedUser.value.email;
    copied.value = false;
    showAutoResetConfirm.value = false;
    showGeneratedPassword.value = true;
  } else {
    dialogError.value = res.error || 'Reset thất bại';
  }
}

async function copyPassword() {
  try {
    await navigator.clipboard.writeText(generatedPassword.value);
    copied.value = true;
  } catch {
    copied.value = false;
  }
}

function closeGeneratedPassword() {
  showGeneratedPassword.value = false;
  // Xoá khỏi memory ngay khi đóng để DevTools không xem được sau.
  generatedPassword.value = '';
  generatedUserEmail.value = '';
}

async function toggleActive(user: OrgUser, val: boolean) {
  saving.value = true;
  await updateUser(user.id, { isActive: val });
  saving.value = false;
}

async function handleCreate() {
  saving.value = true;
  dialogError.value = '';
  const res = await createUser(form.value);
  saving.value = false;
  if (res.ok) { showCreate.value = false; } else { dialogError.value = res.error || ''; }
}

async function handleUpdate() {
  if (!selectedUser.value) return;
  saving.value = true;
  dialogError.value = '';
  // 1. Update info
  const res = await updateUser(selectedUser.value.id, {
    fullName: form.value.fullName,
    email: form.value.email,
    role: form.value.role,
  });
  if (!res.ok) {
    saving.value = false;
    dialogError.value = res.error || '';
    return;
  }
  // 2. Đổi pass nếu user nhập (>= 6 ký tự)
  if (form.value.password && form.value.password.length >= 6) {
    const passRes = await resetPassword(selectedUser.value.id, form.value.password);
    if (!passRes.ok) {
      saving.value = false;
      dialogError.value = passRes.error || 'Đổi mật khẩu thất bại';
      return;
    }
  } else if (form.value.password && form.value.password.length > 0) {
    saving.value = false;
    dialogError.value = 'Mật khẩu mới phải tối thiểu 6 ký tự (hoặc để trống nếu không đổi)';
    return;
  }
  saving.value = false;
  showEdit.value = false;
}



onMounted(fetchUsers);
</script>
