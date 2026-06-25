/**
 * Composable cho Module Sản phẩm (Session 1).
 *
 *   - List + filter (search, brand, status, stock)
 *   - CRUD product (admin only — UI gates the action)
 *   - Price tier management (add / edit / set default / reorder / delete)
 *   - Marketing docs (Drive URL only, never download)
 *   - Backend strips `costPrice` to null for non-admin roles
 */
import { ref, reactive, computed } from 'vue';
import { api } from '@/api/index';

export const PRODUCT_STATUS_OPTIONS = [
  { text: 'Đang bán', value: 'active', color: 'success' },
  { text: 'Sắp về', value: 'coming_soon', color: 'info' },
  { text: 'Ngừng bán', value: 'discontinued', color: 'grey' },
] as const;

export const PRODUCT_UNIT_OPTIONS = [
  { text: 'Hộp', value: 'hộp' },
  { text: 'Lọ', value: 'lọ' },
  { text: 'Chai', value: 'chai' },
  { text: 'Gói', value: 'gói' },
] as const;

export const STOCK_FILTER_OPTIONS = [
  { text: 'Còn hàng', value: 'in_stock' },
  { text: 'Sắp hết', value: 'low' },
  { text: 'Hết hàng', value: 'out' },
] as const;

export const DOC_TYPE_OPTIONS = [
  { text: 'PDF / Doc', value: 'pdf', icon: 'mdi-file-pdf-box' },
  { text: 'Hình ảnh', value: 'image', icon: 'mdi-image' },
  { text: 'Video', value: 'video', icon: 'mdi-video' },
  { text: 'Bài viết', value: 'text', icon: 'mdi-text-box' },
  { text: 'Link khác', value: 'link', icon: 'mdi-link' },
] as const;

export interface ProductPrice {
  id: string;
  productId?: string;
  tierName: string;
  price: number | string;
  displayOrder: number;
  isDefault: boolean;
  active: boolean;
}

export interface MarketingDoc {
  id: string;
  type: string;
  name: string;
  driveUrl: string;
  createdAt: string;
}

export interface Product {
  id: string;
  orgId?: string;
  sku: string;
  name: string;
  brandId: string | null;
  brand?: { id: string; name: string } | null;
  packageSize: string | null;
  mainImageUrl: string | null;
  galleryUrls: string[];
  status: 'active' | 'discontinued' | 'coming_soon';
  // false = admin đã "Ngừng bán" → ẩn khỏi sale-app + không lên đơn được ở sale-app.
  sellable: boolean;
  mainUse: string | null;
  targetAudience: string | null;
  usageMethod: string | null;
  shelfLifeMonths: number | null;
  registrationNumber: string | null;
  totalStock: number;
  warningStock: number;
  unit: string;
  costPrice: number | string | null;
  marketingDocs: MarketingDoc[];
  prices?: ProductPrice[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductFilters {
  search: string;
  brandIds: string[];
  statuses: string[];
  stock: '' | 'in_stock' | 'low' | 'out';
  // Admin-only: also show products that have never been sold (hidden by
  // default). Ignored by the backend for non-admin roles.
  showAll: boolean;
}

export function statusInfo(status: string) {
  return PRODUCT_STATUS_OPTIONS.find((s) => s.value === status) ?? PRODUCT_STATUS_OPTIONS[0];
}

export function docIcon(type: string) {
  return DOC_TYPE_OPTIONS.find((d) => d.value === type)?.icon ?? 'mdi-link';
}

export function formatVND(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '—';
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (Number.isNaN(num)) return '—';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(num);
}

export function stockColor(p: Pick<Product, 'totalStock' | 'warningStock'>): string {
  if (p.totalStock === 0) return 'error';
  if (p.totalStock <= p.warningStock) return 'warning';
  return 'success';
}

export function useProducts() {
  const products = ref<Product[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const saving = ref(false);

  const filters = reactive<ProductFilters>({
    search: '',
    brandIds: [],
    statuses: [],
    stock: '',
    showAll: false,
  });

  const pagination = reactive({ page: 1, limit: 50 });

  async function fetchProducts() {
    loading.value = true;
    try {
      const res = await api.get('/products', {
        params: {
          page: pagination.page,
          limit: pagination.limit,
          search: filters.search || undefined,
          brandId: filters.brandIds.length ? filters.brandIds.join(',') : undefined,
          status: filters.statuses.length ? filters.statuses.join(',') : undefined,
          stock: filters.stock || undefined,
          showAll: filters.showAll ? '1' : undefined,
        },
      });
      products.value = res.data.products ?? [];
      total.value = res.data.total ?? products.value.length;
    } catch (err) {
      console.error('[products] fetch error:', err);
    } finally {
      loading.value = false;
    }
  }

  async function fetchProduct(id: string): Promise<Product | null> {
    try {
      const res = await api.get(`/products/${id}`);
      return res.data;
    } catch (err) {
      console.error('[products] fetch detail error:', err);
      return null;
    }
  }

  async function createProduct(payload: Partial<Product>): Promise<Product | null> {
    saving.value = true;
    try {
      const res = await api.post('/products', payload);
      return res.data;
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Tạo sản phẩm thất bại';
      throw new Error(msg);
    } finally {
      saving.value = false;
    }
  }

  async function updateProduct(id: string, payload: Partial<Product>): Promise<Product | null> {
    saving.value = true;
    try {
      const res = await api.put(`/products/${id}`, payload);
      return res.data;
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Cập nhật sản phẩm thất bại';
      throw new Error(msg);
    } finally {
      saving.value = false;
    }
  }

  async function deleteProduct(id: string): Promise<boolean> {
    try {
      await api.delete(`/products/${id}`);
      return true;
    } catch (err) {
      console.error('[products] delete error:', err);
      return false;
    }
  }

  // ── Price tiers ─────────────────────────────────────────────────────────
  async function addPriceTier(productId: string, tier: Partial<ProductPrice>) {
    const res = await api.post(`/products/${productId}/prices`, tier);
    return res.data as ProductPrice;
  }

  async function updatePriceTier(productId: string, priceId: string, patch: Partial<ProductPrice>) {
    const res = await api.put(`/products/${productId}/prices/${priceId}`, patch);
    return res.data as ProductPrice;
  }

  async function setDefaultPrice(productId: string, priceId: string) {
    await api.put(`/products/${productId}/prices/${priceId}/set-default`);
  }

  async function reorderPrices(productId: string, order: string[]) {
    await api.put(`/products/${productId}/prices/reorder`, { order });
  }

  async function deletePriceTier(productId: string, priceId: string) {
    await api.delete(`/products/${productId}/prices/${priceId}`);
  }

  // ── Marketing docs ──────────────────────────────────────────────────────
  async function addMarketingDoc(productId: string, doc: Pick<MarketingDoc, 'type' | 'name' | 'driveUrl'>) {
    const res = await api.post(`/products/${productId}/marketing-docs`, doc);
    return res.data as MarketingDoc;
  }

  async function deleteMarketingDoc(productId: string, docId: string) {
    await api.delete(`/products/${productId}/marketing-docs/${docId}`);
  }

  function resetFilters() {
    filters.search = '';
    filters.brandIds = [];
    filters.statuses = [];
    filters.stock = '';
    filters.showAll = false;
    pagination.page = 1;
    fetchProducts();
  }

  const hasActiveFilters = computed(
    () =>
      !!filters.search ||
      filters.brandIds.length > 0 ||
      filters.statuses.length > 0 ||
      !!filters.stock,
  );

  return {
    products,
    total,
    loading,
    saving,
    filters,
    pagination,
    hasActiveFilters,
    fetchProducts,
    fetchProduct,
    createProduct,
    updateProduct,
    deleteProduct,
    addPriceTier,
    updatePriceTier,
    setDefaultPrice,
    reorderPrices,
    deletePriceTier,
    addMarketingDoc,
    deleteMarketingDoc,
    resetFilters,
  };
}
