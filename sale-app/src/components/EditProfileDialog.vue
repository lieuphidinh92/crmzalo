<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { initialsOf } from '../composables/useAccount';

const props = defineProps({ user: { type: Object, required: true } });
const emit = defineEmits(['close', 'saved']);
const auth = useAuthStore();
const fileInput = ref(null);
const avatarFile = ref(null);
const avatarObjectUrl = ref('');
const avatarRemoved = ref(false);
const avatarBroken = ref(false);
const loading = ref(false);
const errorMsg = ref('');
const form = ref({
  fullName: props.user?.fullName ?? '',
  email: props.user?.email ?? '',
  birthDate: props.user?.birthDate ? String(props.user.birthDate).slice(0, 10) : '',
});
const initials = computed(() => initialsOf(form.value.fullName || props.user?.fullName));
const avatarPreview = computed(() => avatarRemoved.value ? '' : avatarObjectUrl.value || props.user?.avatarUrl || '');
const maxBirthDate = new Date().toISOString().slice(0, 10);

function releaseObjectUrl() {
  if (avatarObjectUrl.value) URL.revokeObjectURL(avatarObjectUrl.value);
  avatarObjectUrl.value = '';
}
function chooseAvatar() {
  if (!loading.value) fileInput.value?.click();
}
function onAvatarSelected(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    errorMsg.value = 'Ảnh đại diện chỉ hỗ trợ JPG, PNG hoặc WEBP';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    errorMsg.value = 'Ảnh đại diện không được vượt quá 5MB';
    return;
  }
  releaseObjectUrl();
  avatarFile.value = file;
  avatarObjectUrl.value = URL.createObjectURL(file);
  avatarRemoved.value = false;
  avatarBroken.value = false;
  errorMsg.value = '';
}
function removeAvatar() {
  releaseObjectUrl();
  avatarFile.value = null;
  avatarRemoved.value = true;
  avatarBroken.value = false;
}
function closeDialog() {
  if (!loading.value) emit('close');
}

async function submit() {
  if (!form.value.fullName.trim()) {
    errorMsg.value = 'Vui lòng nhập họ tên';
    return;
  }
  if (!form.value.email.trim() || !form.value.email.includes('@')) {
    errorMsg.value = 'Email không hợp lệ';
    return;
  }
  if (form.value.birthDate && form.value.birthDate > maxBirthDate) {
    errorMsg.value = 'Ngày sinh không được lớn hơn ngày hiện tại';
    return;
  }
  loading.value = true;
  errorMsg.value = '';
  try {
    let avatarUrl = avatarRemoved.value ? null : (props.user?.avatarUrl || null);
    if (avatarFile.value) {
      const uploadData = new FormData();
      uploadData.append('file', avatarFile.value);
      const uploadResponse = await api.post('/profile/avatar', uploadData);
      avatarUrl = uploadResponse.data?.url;
      if (!avatarUrl) throw new Error('Không nhận được đường dẫn ảnh sau khi tải lên');
    }
    await api.put(`/users/${props.user.id}`, {
      fullName: form.value.fullName.trim(),
      email: form.value.email.trim(),
      avatarUrl,
      birthDate: form.value.birthDate || null,
    });
    await auth.fetchProfile();
    emit('saved');
    emit('close');
  } catch (err) {
    errorMsg.value = err.response?.data?.error || err.message || 'Lưu hồ sơ thất bại';
  } finally {
    loading.value = false;
  }
}
onBeforeUnmount(releaseObjectUrl);
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" @click.self="closeDialog">
    <div class="bg-white rounded-modal w-full max-w-md p-5 shadow-pop" role="dialog" aria-modal="true" aria-labelledby="edit-profile-title">
      <div class="flex items-center justify-between mb-5">
        <div>
          <h3 id="edit-profile-title" class="text-lg font-bold text-ink-primary">Sửa hồ sơ</h3>
          <p class="text-xs text-ink-secondary mt-0.5">Cập nhật ảnh đại diện và thông tin cá nhân</p>
        </div>
        <button type="button" @click="closeDialog" class="w-9 h-9 rounded-full text-ink-disabled hover:text-ink-primary hover:bg-surface-50 text-xl leading-none" aria-label="Đóng">✕</button>
      </div>

      <form @submit.prevent="submit" class="space-y-4">
        <div class="flex items-center gap-4 rounded-input border border-line-200 bg-surface-50 p-3">
          <button type="button" class="relative w-20 h-20 rounded-full overflow-hidden bg-royal-700 text-white flex items-center justify-center text-xl font-bold shrink-0 ring-4 ring-white shadow-card" @click="chooseAvatar" aria-label="Chọn ảnh đại diện">
            <img v-if="avatarPreview && !avatarBroken" :src="avatarPreview" alt="Ảnh đại diện" class="w-full h-full object-cover" @error="avatarBroken = true" />
            <span v-else>{{ initials }}</span>
            <span class="absolute inset-x-0 bottom-0 h-6 bg-black/55 text-white text-[10px] font-semibold flex items-center justify-center">Thay ảnh</span>
          </button>
          <div class="min-w-0">
            <div class="text-sm font-semibold text-ink-primary">Ảnh đại diện</div>
            <p class="text-xs text-ink-secondary mt-1">JPG, PNG hoặc WEBP. Tối đa 5MB.</p>
            <div class="flex items-center gap-3 mt-2">
              <button type="button" @click="chooseAvatar" class="text-xs font-semibold text-royal-700 hover:text-royal-800">Chọn ảnh</button>
              <button v-if="avatarPreview" type="button" @click="removeAvatar" class="text-xs font-semibold text-red-600 hover:text-red-700">Xóa ảnh</button>
            </div>
          </div>
          <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" @change="onAvatarSelected" />
        </div>

        <div>
          <label class="block text-xs font-medium text-ink-primary mb-1">Họ và tên *</label>
          <input v-model="form.fullName" type="text" autocomplete="name" class="w-full h-11 px-3 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none" />
        </div>
        <div>
          <label class="block text-xs font-medium text-ink-primary mb-1">Email *</label>
          <input v-model="form.email" type="email" autocomplete="email" class="w-full h-11 px-3 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none" />
        </div>
        <div>
          <label class="block text-xs font-medium text-ink-primary mb-1">Ngày tháng năm sinh</label>
          <input v-model="form.birthDate" type="date" :max="maxBirthDate" autocomplete="bday" class="w-full h-11 px-3 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none" />
        </div>

        <div v-if="errorMsg" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-input px-3 py-2" role="alert">{{ errorMsg }}</div>
        <div class="flex gap-2 pt-1">
          <button type="button" @click="closeDialog" class="flex-1 h-11 rounded-btn border border-line-300 text-ink-primary font-medium hover:bg-surface-50" :disabled="loading">Huỷ</button>
          <button type="submit" class="flex-1 h-11 rounded-btn bg-royal-700 hover:bg-royal-800 text-white font-semibold disabled:opacity-50" :disabled="loading">{{ loading ? 'Đang lưu...' : 'Lưu thay đổi' }}</button>
        </div>
      </form>
    </div>
  </div>
</template>
