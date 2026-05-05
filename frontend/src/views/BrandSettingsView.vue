<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h5 mb-0 d-flex align-center">
        <v-icon class="mr-2" color="primary">mdi-tag-multiple-outline</v-icon>
        Brand & Nhà cung cấp
      </h1>
      <v-spacer />
    </div>

    <v-tabs v-model="tab" color="primary" class="mb-4">
      <v-tab value="brands">Brand</v-tab>
      <v-tab value="suppliers">Nhà cung cấp</v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <!-- Tab Brand -->
      <v-window-item value="brands">
        <div class="d-flex justify-end mb-3">
          <v-btn color="primary" prepend-icon="mdi-plus" @click="openBrandCreate">
            Thêm brand
          </v-btn>
        </div>

        <v-card variant="flat" rounded="xl">
          <v-progress-linear v-if="loading" indeterminate color="primary" />
          <v-table density="comfortable">
            <thead>
              <tr>
                <th>Tên brand</th>
                <th>Nhà cung cấp</th>
                <th class="text-right">Sản phẩm</th>
                <th>Trạng thái</th>
                <th class="text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!loading && brands.length === 0">
                <td colspan="5" class="text-center text-medium-emphasis py-6">
                  Chưa có brand
                </td>
              </tr>
              <tr v-for="b in brands" :key="b.id">
                <td>
                  <div class="font-weight-medium">{{ b.name }}</div>
                  <div v-if="b.description" class="text-caption text-medium-emphasis">
                    {{ b.description }}
                  </div>
                </td>
                <td>
                  <span v-if="b.supplier">
                    {{ b.supplier.name }}
                    <span v-if="b.supplier.country" class="text-caption text-medium-emphasis">
                      ({{ b.supplier.country }})
                    </span>
                  </span>
                  <span v-else class="text-medium-emphasis">—</span>
                </td>
                <td class="text-right font-mono">{{ b._count?.products ?? 0 }}</td>
                <td>
                  <v-chip
                    :color="b.active ? 'success' : 'grey'"
                    size="x-small"
                    variant="tonal"
                  >
                    {{ b.active ? 'Hoạt động' : 'Tắt' }}
                  </v-chip>
                </td>
                <td class="text-right">
                  <v-btn icon size="small" variant="text" @click="openBrandEdit(b)">
                    <v-icon size="18">mdi-pencil</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    size="small"
                    variant="text"
                    color="error"
                    :title="(b._count?.products ?? 0) > 0 ? 'Brand đang được dùng' : 'Xoá brand'"
                    @click="askDeleteBrand(b)"
                  >
                    <v-icon size="18">mdi-delete-outline</v-icon>
                  </v-btn>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-window-item>

      <!-- Tab Supplier -->
      <v-window-item value="suppliers">
        <div class="d-flex justify-end mb-3">
          <v-btn color="primary" prepend-icon="mdi-plus" @click="openSupplierCreate">
            Thêm NCC
          </v-btn>
        </div>

        <v-card variant="flat" rounded="xl">
          <v-table density="comfortable">
            <thead>
              <tr>
                <th>Tên NCC</th>
                <th>Quốc gia</th>
                <th>Liên hệ</th>
                <th class="text-right">Brand</th>
                <th>Trạng thái</th>
                <th class="text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!loading && suppliers.length === 0">
                <td colspan="6" class="text-center text-medium-emphasis py-6">
                  Chưa có NCC
                </td>
              </tr>
              <tr v-for="s in suppliers" :key="s.id">
                <td class="font-weight-medium">{{ s.name }}</td>
                <td>{{ s.country || '—' }}</td>
                <td class="text-caption">
                  {{ truncate(s.contactInfo, 50) || '—' }}
                </td>
                <td class="text-right font-mono">{{ s._count?.brands ?? 0 }}</td>
                <td>
                  <v-chip
                    :color="s.active ? 'success' : 'grey'"
                    size="x-small"
                    variant="tonal"
                  >
                    {{ s.active ? 'Hoạt động' : 'Tắt' }}
                  </v-chip>
                </td>
                <td class="text-right">
                  <v-btn icon size="small" variant="text" @click="openSupplierEdit(s)">
                    <v-icon size="18">mdi-pencil</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    size="small"
                    variant="text"
                    color="error"
                    @click="askDeleteSupplier(s)"
                  >
                    <v-icon size="18">mdi-delete-outline</v-icon>
                  </v-btn>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-window-item>
    </v-window>

    <BrandFormDialog
      v-model="brandDialog"
      :editing="editingBrand"
      :suppliers="suppliers"
      @saved="onBrandSaved"
    />
    <SupplierFormDialog
      v-model="supplierDialog"
      :editing="editingSupplier"
      @saved="onSupplierSaved"
    />

    <!-- Confirm delete dialog -->
    <v-dialog v-model="deleteDialog" max-width="420">
      <v-card>
        <v-card-title>{{ pendingDelete.title }}</v-card-title>
        <v-card-text>{{ pendingDelete.message }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog = false">Huỷ</v-btn>
          <v-btn color="error" :loading="deleting" @click="confirmDelete">Xoá</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3500">
      {{ snackbar.text }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useBrands, type Brand, type Supplier } from '@/composables/use-brands';
import BrandFormDialog from '@/components/products/BrandFormDialog.vue';
import SupplierFormDialog from '@/components/products/SupplierFormDialog.vue';

const authStore = useAuthStore();
const router = useRouter();

const isAdmin = computed(() => {
  const r = authStore.user?.role ?? '';
  return r === 'owner' || r === 'admin';
});

watch(
  isAdmin,
  (v) => {
    if (!v) router.replace('/');
  },
  { immediate: true },
);

const tab = ref<'brands' | 'suppliers'>('brands');

const {
  brands,
  suppliers,
  loading,
  fetchBrands,
  fetchSuppliers,
  deleteBrand,
  deleteSupplier,
} = useBrands();

const brandDialog = ref(false);
const supplierDialog = ref(false);
const editingBrand = ref<Brand | null>(null);
const editingSupplier = ref<Supplier | null>(null);

function openBrandCreate() {
  editingBrand.value = null;
  brandDialog.value = true;
}
function openBrandEdit(b: Brand) {
  editingBrand.value = b;
  brandDialog.value = true;
}
function onBrandSaved() {
  fetchBrands();
  showSnackbar('Đã lưu brand', 'success');
}

function openSupplierCreate() {
  editingSupplier.value = null;
  supplierDialog.value = true;
}
function openSupplierEdit(s: Supplier) {
  editingSupplier.value = s;
  supplierDialog.value = true;
}
function onSupplierSaved() {
  fetchSuppliers();
  fetchBrands();
  showSnackbar('Đã lưu NCC', 'success');
}

// ── Delete confirmation ─────────────────────────────────────────────────
const deleteDialog = ref(false);
const deleting = ref(false);
const pendingDelete = reactive<{
  type: 'brand' | 'supplier' | null;
  id: string | null;
  title: string;
  message: string;
}>({ type: null, id: null, title: '', message: '' });

function askDeleteBrand(b: Brand) {
  pendingDelete.type = 'brand';
  pendingDelete.id = b.id;
  pendingDelete.title = `Xoá brand "${b.name}"?`;
  const used = b._count?.products ?? 0;
  pendingDelete.message =
    used > 0
      ? `Brand này đang được dùng bởi ${used} sản phẩm. Hệ thống sẽ chặn xoá.`
      : 'Brand sẽ được tắt (soft delete) — vẫn giữ lịch sử trong DB.';
  deleteDialog.value = true;
}

function askDeleteSupplier(s: Supplier) {
  pendingDelete.type = 'supplier';
  pendingDelete.id = s.id;
  pendingDelete.title = `Xoá NCC "${s.name}"?`;
  const used = s._count?.brands ?? 0;
  pendingDelete.message =
    used > 0
      ? `NCC này đang gắn với ${used} brand. Hệ thống sẽ chặn xoá.`
      : 'NCC sẽ được tắt (soft delete) — vẫn giữ lịch sử trong DB.';
  deleteDialog.value = true;
}

async function confirmDelete() {
  if (!pendingDelete.id || !pendingDelete.type) return;
  deleting.value = true;
  try {
    const res =
      pendingDelete.type === 'brand'
        ? await deleteBrand(pendingDelete.id)
        : await deleteSupplier(pendingDelete.id);
    if (res.ok) {
      deleteDialog.value = false;
      showSnackbar('Đã xoá', 'success');
      pendingDelete.type === 'brand' ? fetchBrands() : fetchSuppliers();
    } else {
      showSnackbar(res.error ?? 'Xoá thất bại', 'error');
      deleteDialog.value = false;
    }
  } finally {
    deleting.value = false;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────
function truncate(s: string | null, n: number) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

const snackbar = reactive<{ show: boolean; text: string; color: string }>({
  show: false,
  text: '',
  color: 'success',
});
function showSnackbar(text: string, color: 'success' | 'error' = 'success') {
  snackbar.text = text;
  snackbar.color = color;
  snackbar.show = true;
}

onMounted(() => {
  if (!isAdmin.value) return;
  fetchBrands();
  fetchSuppliers();
});
</script>

<style scoped>
.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
</style>
