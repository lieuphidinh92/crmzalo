<template>
  <div>
    <!-- Header -->
    <div class="d-flex align-center mb-1 flex-wrap gap-2">
      <div>
        <h1 class="text-h5 mb-0 d-flex align-center">
          <v-icon class="mr-2" color="primary">mdi-package-variant-closed</v-icon>
          Sản phẩm
        </h1>
        <div class="text-caption text-medium-emphasis">
          Quản lý SKU, giá sỉ, tài liệu MKT
        </div>
      </div>
      <v-spacer />
      <v-btn
        v-if="isAdmin"
        color="primary"
        prepend-icon="mdi-plus"
        @click="goNew"
      >
        Thêm sản phẩm
      </v-btn>
    </div>

    <!-- Filter bar -->
    <v-card variant="flat" rounded="xl" class="px-4 py-3 my-3">
      <v-row dense align="center">
        <v-col cols="12" sm="6" md="4">
          <v-text-field
            v-model="filters.search"
            placeholder="Tìm theo SKU hoặc tên..."
            prepend-inner-icon="mdi-magnify"
            clearable
            hide-details
            @update:model-value="onFilterChange"
            @click:clear="onFilterChange"
          />
        </v-col>
        <v-col cols="6" sm="4" md="3">
          <v-select
            v-model="filters.brandIds"
            :items="brandItems"
            item-title="text"
            item-value="value"
            placeholder="Brand"
            multiple
            chips
            closable-chips
            hide-details
            clearable
            @update:model-value="onFilterChange"
          />
        </v-col>
        <v-col cols="6" sm="4" md="3">
          <v-select
            v-model="filters.statuses"
            :items="statusItems"
            item-title="text"
            item-value="value"
            placeholder="Trạng thái"
            multiple
            chips
            closable-chips
            hide-details
            clearable
            @update:model-value="onFilterChange"
          />
        </v-col>
        <v-col cols="12" sm="4" md="2">
          <v-select
            v-model="filters.stock"
            :items="stockItems"
            item-title="text"
            item-value="value"
            placeholder="Tồn kho"
            hide-details
            clearable
            @update:model-value="onFilterChange"
          />
        </v-col>
      </v-row>

      <div v-if="hasActiveFilters" class="mt-2 text-right">
        <v-btn
          variant="text"
          size="small"
          prepend-icon="mdi-close"
          @click="resetFilters"
        >
          Xoá bộ lọc
        </v-btn>
      </div>
    </v-card>

    <!-- Loading skeleton -->
    <v-row v-if="loading && products.length === 0" dense>
      <v-col v-for="n in 8" :key="n" cols="6" sm="4" md="3" lg="2">
        <v-skeleton-loader type="image, article" />
      </v-col>
    </v-row>

    <!-- Empty state -->
    <v-card
      v-else-if="!loading && products.length === 0"
      variant="flat"
      rounded="xl"
      class="empty-state pa-8 text-center"
    >
      <v-icon size="80" color="grey-lighten-1" class="mb-4">
        mdi-package-variant-closed
      </v-icon>
      <div class="text-h6 mb-2">
        {{ hasActiveFilters ? 'Không tìm thấy sản phẩm phù hợp' : 'Chưa có sản phẩm nào' }}
      </div>
      <div class="text-body-2 text-medium-emphasis mb-4">
        {{
          hasActiveFilters
            ? 'Thử bỏ bớt bộ lọc hoặc tìm kiếm khác'
            : 'Bắt đầu bằng cách thêm sản phẩm đầu tiên'
        }}
      </div>
      <v-btn v-if="isAdmin && !hasActiveFilters" color="primary" prepend-icon="mdi-plus" @click="goNew">
        Thêm sản phẩm đầu tiên
      </v-btn>
      <v-btn v-else-if="hasActiveFilters" variant="text" prepend-icon="mdi-close" @click="resetFilters">
        Xoá bộ lọc
      </v-btn>
    </v-card>

    <!-- Grid -->
    <v-row v-else dense>
      <v-col
        v-for="p in products"
        :key="p.id"
        cols="6"
        sm="4"
        md="3"
        lg="2"
      >
        <ProductCard :product="p" @open="openDetail" />
      </v-col>
    </v-row>

    <!-- Total info -->
    <div v-if="products.length > 0" class="text-caption text-medium-emphasis mt-4 text-center">
      Hiển thị {{ products.length }} / {{ total }} sản phẩm
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import {
  useProducts,
  PRODUCT_STATUS_OPTIONS,
  STOCK_FILTER_OPTIONS,
} from '@/composables/use-products';
import { useBrands } from '@/composables/use-brands';
import ProductCard from '@/components/products/ProductCard.vue';

const router = useRouter();
const authStore = useAuthStore();

const isAdmin = computed(() => {
  const r = authStore.user?.role ?? '';
  return r === 'owner' || r === 'admin';
});

const {
  products,
  total,
  loading,
  filters,
  hasActiveFilters,
  fetchProducts,
  resetFilters,
} = useProducts();

const { brands, fetchBrands } = useBrands();

const brandItems = computed(() =>
  brands.value
    .filter((b) => b.active)
    .map((b) => ({ text: b.name, value: b.id })),
);
const statusItems = PRODUCT_STATUS_OPTIONS.map((s) => ({ text: s.text, value: s.value }));
const stockItems = STOCK_FILTER_OPTIONS.map((s) => ({ text: s.text, value: s.value }));

let searchTimer: ReturnType<typeof setTimeout> | null = null;

function onFilterChange() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    fetchProducts();
  }, 250);
}

function goNew() {
  router.push('/products/new');
}

function openDetail(id: string) {
  router.push(`/products/${id}`);
}

onMounted(async () => {
  await Promise.all([fetchBrands(), fetchProducts()]);
});

watch(
  () => filters.search,
  () => {
    // search debounce already handled in onFilterChange via @update:model-value
  },
);
</script>

<style scoped>
.empty-state {
  border: 1px dashed rgba(255, 255, 255, 0.18);
}
.gap-2 {
  gap: 8px;
}
</style>
