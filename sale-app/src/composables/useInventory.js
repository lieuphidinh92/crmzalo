import { ref, computed } from 'vue';
import { api } from '../api/client';

/**
 * Inventory composable: feeds /inventory page.
 *
 * Two data sources because backend split the concerns:
 *  - /inventory/alerts → 3 health buckets + summary counts (KPI source).
 *    Member-safe (no cost field anywhere). Used for `lowStock`,
 *    `expiringIn90`, `expired` chip filters.
 *  - /sale-app/products → searchable paginated catalogue. Used for
 *    the "Tất cả" chip + search/brand combo, since alerts endpoint
 *    only emits flagged rows.
 *
 * Brand list piggybacks on /brands; we silently fall back to empty
 * so the page stays usable even if /brands 404s.
 */
export function useInventory() {
  const alerts = ref({
    summary: { lowStockCount: 0, expiringCount: 0, expiredCount: 0, totalCount: 0 },
    lowStock: [],
    expiringIn90: [],
    expired: [],
  });
  const products = ref([]);
  const total = ref(0);
  const brands = ref([]);

  const alertsLoading = ref(false);
  const listLoading = ref(false);
  const errorMsg = ref('');

  // Active-product count is best estimated from a list query for the
  // "Tất cả" tab. We cache it the first time the "all" tab loads.
  const activeProductTotal = ref(null);

  async function loadAlerts() {
    alertsLoading.value = true;
    try {
      const { data } = await api.get('/inventory/alerts');
      alerts.value = {
        summary: data.summary ?? { lowStockCount: 0, expiringCount: 0, expiredCount: 0, totalCount: 0 },
        lowStock: data.lowStock ?? [],
        expiringIn90: data.expiringIn90 ?? [],
        expired: data.expired ?? [],
      };
    } catch (err) {
      errorMsg.value = err.response?.data?.error || 'Không tải được cảnh báo tồn kho';
    } finally {
      alertsLoading.value = false;
    }
  }

  async function loadBrands() {
    try {
      const { data } = await api.get('/brands');
      brands.value = data.brands || data || [];
    } catch {
      brands.value = [];
    }
  }

  async function loadProducts({ q = '', brand = '', filter = '', page = 1, limit = 20 } = {}) {
    listLoading.value = true;
    errorMsg.value = '';
    try {
      const params = { page, limit, sort: 'name' };
      if (q) params.q = q;
      if (brand) params.brand = brand;
      if (filter) params.filter = filter;
      const { data } = await api.get('/sale-app/products', { params });
      products.value = data.products || [];
      total.value = data.total ?? products.value.length;
      if (!filter && !q && !brand && activeProductTotal.value === null) {
        activeProductTotal.value = data.total ?? 0;
      }
    } catch (err) {
      errorMsg.value = err.response?.data?.error || 'Không tải được danh sách tồn kho';
      products.value = [];
      total.value = 0;
    } finally {
      listLoading.value = false;
    }
  }

  /**
   * Build view rows for the current chip. For "low-stock" / "near-expiry"
   * / "expired" we prefer the alerts buckets (they're already filtered
   * server-side and lighter) unless the user typed a search query or
   * picked a brand — in that case we fall through to the catalog
   * endpoint so search/brand can actually narrow results.
   */
  function rowsFromAlerts(chip) {
    if (chip === 'low-stock') {
      return alerts.value.lowStock.map((r) => ({
        id: r.productId,
        sku: r.sku,
        name: r.name,
        stock: r.totalStock,
        warning_stock: r.warningStock,
        unit: r.unit,
        nearest_expiry: null,
        nearest_days_left: null,
        brand: null,
        mainImageUrl: null,
      }));
    }
    if (chip === 'near-expiry') {
      // Multiple lots per SKU → keep the closest expiry per product so
      // each SKU shows once in the list.
      const byProduct = new Map();
      for (const b of alerts.value.expiringIn90) {
        const cur = byProduct.get(b.productId);
        if (!cur || b.daysLeft < cur.nearest_days_left) {
          byProduct.set(b.productId, {
            id: b.productId,
            sku: b.productSku,
            name: b.productName,
            stock: null,
            warning_stock: null,
            unit: null,
            nearest_expiry: b.expiryDate,
            nearest_days_left: b.daysLeft,
            brand: null,
            mainImageUrl: null,
          });
        }
      }
      return Array.from(byProduct.values());
    }
    if (chip === 'expired') {
      const byProduct = new Map();
      for (const b of alerts.value.expired) {
        const cur = byProduct.get(b.productId);
        if (!cur || b.daysLeft < cur.nearest_days_left) {
          byProduct.set(b.productId, {
            id: b.productId,
            sku: b.productSku,
            name: b.productName,
            stock: null,
            warning_stock: null,
            unit: null,
            nearest_expiry: b.expiryDate,
            nearest_days_left: b.daysLeft,
            brand: null,
            mainImageUrl: null,
          });
        }
      }
      return Array.from(byProduct.values());
    }
    return [];
  }

  const summary = computed(() => alerts.value.summary);

  return {
    alerts,
    products,
    brands,
    total,
    summary,
    activeProductTotal,
    alertsLoading,
    listLoading,
    errorMsg,
    loadAlerts,
    loadBrands,
    loadProducts,
    rowsFromAlerts,
  };
}

/**
 * Map days-until-expiry to a friendly Vietnamese label + Tailwind class
 * set, matching the spec: <0 đỏ, 0-29 đỏ, 30-89 vàng, >=90 xám.
 */
export function expiryBadge(days) {
  if (days === null || days === undefined) return null;
  if (days < 0) return { label: `Đã hết HSD ${Math.abs(days)}d`, cls: 'text-red-700 bg-red-50' };
  if (days < 30) return { label: `Còn ${days} ngày`, cls: 'text-red-700 bg-red-50' };
  if (days < 90) return { label: `Còn ${days} ngày`, cls: 'text-amber-700 bg-amber-50' };
  return { label: `Còn ${days} ngày`, cls: 'text-ink-secondary bg-surface-soft' };
}

/**
 * Stock color level — 0 đỏ, <=warning vàng, ngược lại xanh.
 */
export function stockLevel(stock, warningStock) {
  if (stock === null || stock === undefined) return 'text-ink-secondary';
  if (stock <= 0) return 'text-red-700';
  if (warningStock !== null && warningStock !== undefined && stock <= warningStock) return 'text-amber-700';
  return 'text-green-700';
}
