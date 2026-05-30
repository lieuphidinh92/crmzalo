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
    submitOrder,
  };
});
