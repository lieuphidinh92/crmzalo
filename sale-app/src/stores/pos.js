import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/client';

export const usePOSStore = defineStore('pos', () => {
  const selectedCustomer = ref(null);
  const selectedTier = ref('dai_ly_cap_1');
  const items = ref([]);
  const shippingMethod = ref('pickup_at_warehouse');
  const paymentMethod = ref('cod');
  const note = ref('');
  const submitting = ref(false);

  const totalAmount = computed(() =>
    items.value.reduce((s, it) => s + it.unitPrice * it.quantity, 0),
  );
  const itemCount = computed(() => items.value.reduce((s, it) => s + it.quantity, 0));

  function selectCustomer(c) {
    selectedCustomer.value = c;
    if (c?.policyTier) selectedTier.value = c.policyTier;
  }

  function clearCustomer() {
    selectedCustomer.value = null;
  }

  function addProduct(product) {
    const existing = items.value.find((it) => it.productId === product.id);
    if (existing) {
      existing.quantity += 1;
      return;
    }
    items.value.push({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      unit: product.unit,
      stock: product.stock,
      unitPrice: product.price,
      priceTierId: product.priceTierId,
      priceTierName: product.priceTierName,
      quantity: 1,
    });
  }

  function updateQuantity(productId, qty) {
    const it = items.value.find((x) => x.productId === productId);
    if (!it) return;
    const newQty = Math.max(1, Math.floor(qty) || 1);
    it.quantity = newQty;
  }

  function removeProduct(productId) {
    items.value = items.value.filter((x) => x.productId !== productId);
  }

  /**
   * Đặt lại đơn cũ: nạp toàn bộ SP của đơn cũ vào giỏ POS.
   * - GIỮ số lượng cũ, NHƯNG lấy GIÁ HIỆN TẠI (theo tier của KH) — không
   *   dùng giá đã chốt trong đơn cũ.
   * - Nạp lại khách hàng của đơn cũ (nếu có) để tier giá khớp.
   * - SP nay ngừng bán / hết giá hiện tại → bỏ qua, gom vào `skipped`.
   *
   * Giá hiện tại lấy từ cùng endpoint mà ProductCatalog dùng:
   *   GET /sale-app/products/search?q=<sku>&tier=<tier>
   * → bảo đảm giá nhất quán với luồng thêm SP thủ công.
   *
   * @param {Object} order  Order detail trả về từ GET /orders/:id
   * @returns {Promise<{ added: number, skipped: string[] }>}
   */
  async function loadCartFromOrder(order) {
    reset();

    // 1) Nạp khách hàng (đặt trước để selectedTier khớp policyTier của KH)
    if (order?.contact?.id) {
      selectCustomer(order.contact);
    }
    const tier = selectedTier.value;

    const orderItems = Array.isArray(order?.items) ? order.items : [];
    const skipped = [];
    const nextItems = [];

    // 2) Với mỗi SP: tra giá hiện tại theo SKU + tier. SKU là khoá đáng tin
    //    nhất (đơn MISA cũ có thể thiếu productId).
    for (const it of orderItems) {
      const sku = (it.sku || it.product?.sku || '').trim();
      const displayName = it.productName || it.product?.name || sku || 'SP không tên';
      const oldQty = Math.max(1, Math.floor(Number(it.quantity) || 0) || 1);

      if (!sku) {
        skipped.push(displayName);
        continue;
      }

      let current = null;
      try {
        const { data } = await api.get('/sale-app/products/search', {
          params: { q: sku, tier },
        });
        const products = data.products || [];
        // Khớp đúng SKU (search có thể trả nhiều SP gần đúng).
        current =
          products.find((p) => (p.sku || '').trim().toLowerCase() === sku.toLowerCase()) || null;
      } catch {
        current = null;
      }

      // SP ngừng bán (không còn active → không trả về) hoặc hết giá hiện tại.
      if (!current || !current.price || current.price <= 0 || !current.priceTierId) {
        skipped.push(displayName);
        continue;
      }

      nextItems.push({
        productId: current.id,
        sku: current.sku,
        name: current.name,
        unit: current.unit,
        stock: current.stock,
        unitPrice: current.price,
        priceTierId: current.priceTierId,
        priceTierName: current.priceTierName,
        quantity: oldQty,
      });
    }

    items.value = nextItems;
    return { added: nextItems.length, skipped };
  }

  function reset() {
    selectedCustomer.value = null;
    selectedTier.value = 'dai_ly_cap_1';
    items.value = [];
    shippingMethod.value = 'pickup_at_warehouse';
    paymentMethod.value = 'cod';
    note.value = '';
  }

  function changeTier(tier) {
    selectedTier.value = tier;
    // Note: prices in cart are SNAPSHOT — changing tier here doesn't
    // retro-update prices already added. User must re-pick products to
    // get tier-specific prices. (Acceptable for Phase 1; flag for Phase 2.)
  }

  async function submitOrder() {
    if (!selectedCustomer.value) throw new Error('Vui lòng chọn khách hàng');
    if (items.value.length === 0) throw new Error('Vui lòng chọn ít nhất 1 sản phẩm');

    submitting.value = true;
    try {
      const payload = {
        contactId: selectedCustomer.value.id,
        items: items.value.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          priceTierId: it.priceTierId,
        })),
        shippingMethod: shippingMethod.value,
        paymentMethod: paymentMethod.value,
        note: note.value || null,
        source: 'sale_app',
      };
      const { data } = await api.post('/sale-app/orders', payload);
      return data.order;
    } finally {
      submitting.value = false;
    }
  }

  return {
    selectedCustomer,
    selectedTier,
    items,
    shippingMethod,
    paymentMethod,
    note,
    submitting,
    totalAmount,
    itemCount,
    selectCustomer,
    clearCustomer,
    addProduct,
    updateQuantity,
    removeProduct,
    changeTier,
    reset,
    loadCartFromOrder,
    submitOrder,
  };
});
