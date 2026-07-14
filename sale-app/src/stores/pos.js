import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/client';
import { useAuthStore } from './auth';

// Id NV đang đăng nhập (khách mới mặc định gán cho người này).
function currentUserId() {
  const auth = useAuthStore();
  return auth.user?.id ?? auth.user?.userId ?? null;
}
function currentUserName() {
  const auth = useAuthStore();
  return auth.user?.fullName ?? auth.user?.full_name ?? '';
}

export const usePOSStore = defineStore('pos', () => {
  const selectedCustomer = ref(null);
  const customerDetail = ref(null); // chi tiết KH: công nợ, điểm, hạn mức, đơn gần nhất
  const selectedTier = ref('thung_1');
  const items = ref([]);
  const shippingMethod = ref('pickup_at_warehouse');
  const paymentMethod = ref('cod');
  const shippingFee = ref(0);
  const paidAmount = ref(0); // Trả trước (chỉ dùng cho đơn công nợ)
  const debtTermDays = ref(0); // Số ngày cho nợ (chỉ đơn công nợ)
  const note = ref('');
  // Phase 3 — người nhận & địa chỉ giao riêng (theo đơn)
  const recipientName = ref('');
  const recipientPhone = ref('');
  const deliveryAddress = ref('');
  // Phase 4 — xuất hóa đơn VAT (giá đã gồm VAT, chỉ thu thập thông tin người mua)
  const needsVatInvoice = ref(false);
  const invoiceBuyerType = ref('cong_ty'); // ca_nhan | ho_kinh_doanh | cong_ty
  const invoiceBuyerName = ref('');
  const invoiceTaxCode = ref('');
  const invoiceAddress = ref('');
  const invoiceEmail = ref('');
  const saveInvoiceToCustomer = ref(false);
  // Phase 5 — nhân viên sale phụ trách + người giới thiệu
  const staffList = ref([]);
  const assignedSaleId = ref(null);
  const referrerName = ref('');
  // Pháp nhân xuất chứng từ (Phiếu xuất kho + Biên bản bàn giao): halovn | inocare
  const invoicingCompany = ref('halovn');
  const submitting = ref(false);

  // Tải danh sách nhân viên (gọi 1 lần khi mở màn). Mặc định NV sale = NV đăng nhập.
  async function loadStaff() {
    try {
      const { data } = await api.get('/sale-app/staff');
      staffList.value = data.staff || [];
    } catch {
      staffList.value = [];
    }
    if (!assignedSaleId.value) assignedSaleId.value = currentUserId();
  }

  // Thành tiền 1 dòng = đơn giá × số lượng − chiết khấu dòng (kẹp >= 0).
  function lineTotal(it) {
    const gross = (Number(it.unitPrice) || 0) * (Number(it.quantity) || 0);
    return Math.max(0, gross - (Number(it.discountValue) || 0));
  }

  // Tiền hàng = tổng các dòng SP sau chiết khấu (chưa gồm phí ship).
  const subtotal = computed(() =>
    items.value.reduce((s, it) => s + lineTotal(it), 0),
  );
  // Tổng chiết khấu dòng (để hiển thị dòng "Chiết khấu" trong khối tổng tiền).
  const totalDiscount = computed(() =>
    items.value.reduce((s, it) => s + (Number(it.discountValue) || 0), 0),
  );
  // Tổng thanh toán = tiền hàng (đã trừ chiết khấu dòng) + phí ship.
  const totalAmount = computed(() => subtotal.value + (Number(shippingFee.value) || 0));
  const isCredit = computed(() => paymentMethod.value === 'credit');
  // Còn nợ = tổng thanh toán − trả trước (chỉ tính khi đơn công nợ).
  const debtAmount = computed(() => {
    if (!isCredit.value) return 0;
    return Math.max(0, totalAmount.value - (Number(paidAmount.value) || 0));
  });
  const itemCount = computed(() => items.value.reduce((s, it) => s + it.quantity, 0));

  function selectCustomer(c) {
    selectedCustomer.value = c;
    if (c?.policyTier) selectedTier.value = c.policyTier;
    // Phase 3 — prefill địa chỉ giao theo KH; tên/SĐT người nhận để trống
    // (placeholder ở UI hiển thị tên/SĐT KH = mặc định giao theo KH).
    deliveryAddress.value = c?.address || '';
    // Phase 4 — prefill hồ sơ xuất HĐ mặc định của KH (sửa được theo đơn).
    invoiceBuyerType.value = c?.invoiceBuyerType || 'cong_ty';
    invoiceBuyerName.value = c?.invoiceBuyerName || c?.storeName || c?.fullName || '';
    invoiceTaxCode.value = c?.invoiceTaxCode || '';
    invoiceAddress.value = c?.invoiceAddress || c?.address || '';
    invoiceEmail.value = c?.invoiceEmail || '';
    saveInvoiceToCustomer.value = false;
    // Phase 5 — NV sale: khách cũ → NV phụ trách theo lịch sử; khách mới → NV đăng nhập.
    assignedSaleId.value = c?.assignedUserId || c?.assigned_user?.id || currentUserId();
    // Tải chi tiết KH (công nợ hiện tại, điểm, hạn mức, đơn gần nhất) — không chặn UI.
    customerDetail.value = null;
    loadCustomerDetail(c?.id);
  }

  // Lấy chi tiết KH cho panel bên trái (debt/points/credit limit/recent orders).
  async function loadCustomerDetail(id) {
    if (!id) return;
    try {
      const { data } = await api.get(`/sale-app/customers/${id}`);
      // Chỉ nhận nếu vẫn đang chọn đúng KH này (tránh race khi đổi KH nhanh).
      if (selectedCustomer.value?.id === id) customerDetail.value = data.customer || null;
    } catch {
      if (selectedCustomer.value?.id === id) customerDetail.value = null;
    }
  }

  // Xóa toàn bộ sản phẩm trong giỏ (giữ KH + cấu hình).
  function clearAll() {
    items.value = [];
  }

  function clearCustomer() {
    selectedCustomer.value = null;
    customerDetail.value = null;
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
      nearestExpiry: product.nearest_expiry ?? product.nearestExpiry ?? null,
      unitPrice: product.price,
      priceTierId: product.priceTierId,
      priceTierName: product.priceTierName,
      quantity: 1,
      discountValue: 0,
    });
  }

  function updateQuantity(productId, qty) {
    const it = items.value.find((x) => x.productId === productId);
    if (!it) return;
    const newQty = Math.max(1, Math.floor(qty) || 1);
    it.quantity = newQty;
  }

  // Phase 2 — sửa đơn giá thương lượng từng dòng (integer VND >= 0).
  function updateUnitPrice(productId, price) {
    const it = items.value.find((x) => x.productId === productId);
    if (!it) return;
    it.unitPrice = Math.max(0, Math.floor(Number(price) || 0));
  }

  // Phase 2 — chiết khấu từng dòng (integer VND >= 0).
  function updateDiscount(productId, discount) {
    const it = items.value.find((x) => x.productId === productId);
    if (!it) return;
    it.discountValue = Math.max(0, Math.floor(Number(discount) || 0));
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
        nearestExpiry: current.nearest_expiry ?? current.nearestExpiry ?? null,
        unitPrice: current.price,
        priceTierId: current.priceTierId,
        priceTierName: current.priceTierName,
        quantity: oldQty,
        discountValue: 0,
      });
    }

    items.value = nextItems;
    return { added: nextItems.length, skipped };
  }

  // Snapshot toàn bộ dữ liệu đơn để dựng phiếu (gọi TRƯỚC khi reset()).
  function buildOrderSnapshot() {
    const c = selectedCustomer.value || {};
    const sale = staffList.value.find((s) => s.id === assignedSaleId.value);
    const paid = isCredit.value ? Number(paidAmount.value) || 0 : 0;
    const total = totalAmount.value;
    return {
      saleName: sale?.fullName || currentUserName() || '',
      customerName: c.fullName || c.full_name || '',
      customerPhone: c.phone || '',
      customerCompany: invoiceBuyerName.value?.trim() || '',
      customerTaxCode: invoiceTaxCode.value?.trim() || '',
      customerAddress: invoiceAddress.value?.trim() || c.address || '',
      note: note.value?.trim() || '',
      recipientName: recipientName.value?.trim() || '',
      recipientPhone: recipientPhone.value?.trim() || '',
      deliveryAddress: deliveryAddress.value?.trim() || c.address || '',
      items: items.value.map((it) => ({
        name: it.name,
        sku: it.sku,
        unit: it.unit,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        lineTotal: lineTotal(it),
      })),
      subtotal: subtotal.value,
      totalDiscount: totalDiscount.value,
      shippingFee: Number(shippingFee.value) || 0,
      total,
      paid,
      debt: Math.max(0, total - paid),
      paymentMethod: paymentMethod.value,
      shippingMethod: shippingMethod.value,
      invoicingCompany: invoicingCompany.value,
    };
  }

  function reset() {
    selectedCustomer.value = null;
    customerDetail.value = null;
    selectedTier.value = 'thung_1';
    items.value = [];
    shippingMethod.value = 'pickup_at_warehouse';
    paymentMethod.value = 'cod';
    shippingFee.value = 0;
    paidAmount.value = 0;
    debtTermDays.value = 0;
    note.value = '';
    recipientName.value = '';
    recipientPhone.value = '';
    deliveryAddress.value = '';
    needsVatInvoice.value = false;
    invoiceBuyerType.value = 'cong_ty';
    invoiceBuyerName.value = '';
    invoiceTaxCode.value = '';
    invoiceAddress.value = '';
    invoiceEmail.value = '';
    saveInvoiceToCustomer.value = false;
    // Reset NV sale về NV đang đăng nhập (mặc định khách mới); giữ staffList đã tải.
    assignedSaleId.value = currentUserId();
    referrerName.value = '';
    invoicingCompany.value = 'halovn';
  }

  function changeTier(tier) {
    selectedTier.value = tier;
    // Note: prices in cart are SNAPSHOT — changing tier here doesn't
    // retro-update prices already added. User must re-pick products to
    // get tier-specific prices. (Acceptable for Phase 1; flag for Phase 2.)
  }

  async function submitOrder(status = 'confirmed') {
    const isDraft = status === 'draft';
    if (!selectedCustomer.value) throw new Error('Vui lòng chọn khách hàng');
    if (items.value.length === 0) throw new Error('Vui lòng chọn ít nhất 1 sản phẩm');
    // Đơn nháp (lưu tạm) cho phép thiếu hạn nợ — điền sau khi chốt.
    if (!isDraft && isCredit.value && (Number(debtTermDays.value) || 0) <= 0)
      throw new Error('Đơn công nợ cần nhập số ngày cho nợ');
    if (
      needsVatInvoice.value &&
      (invoiceBuyerType.value === 'cong_ty' || invoiceBuyerType.value === 'ho_kinh_doanh') &&
      !invoiceTaxCode.value?.trim()
    )
      throw new Error('Hộ kinh doanh / Công ty cần nhập Mã số thuế để xuất hóa đơn');

    // Bán âm kho: chỉ quản lý (owner/admin) được chốt đơn vượt tồn. Member phải bán
    // trong tồn. Đơn nháp không chặn (member lưu tạm, quản lý duyệt sau). Backend
    // vẫn chặn lại lần nữa — đây chỉ là chặn sớm cho UX.
    if (!isDraft) {
      const role = useAuthStore().user?.role;
      const canOversell = role === 'owner' || role === 'admin';
      if (!canOversell) {
        const over = items.value.find(
          (it) => it.stock !== undefined && it.stock !== null && it.quantity > it.stock,
        );
        if (over)
          throw new Error(
            `"${over.name}" chỉ còn ${over.stock}${over.unit ? ' ' + over.unit : ''} trong kho — chỉ quản lý được bán vượt tồn. Giảm số lượng hoặc nhờ quản lý chốt đơn.`,
          );
      }
    }

    submitting.value = true;
    try {
      const payload = {
        contactId: selectedCustomer.value.id,
        items: items.value.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          priceTierId: it.priceTierId,
          discountValue: it.discountValue || 0,
        })),
        status,
        shippingMethod: shippingMethod.value,
        paymentMethod: paymentMethod.value,
        shippingFee: Number(shippingFee.value) || 0,
        paidAmount: isCredit.value ? Number(paidAmount.value) || 0 : 0,
        debtTermDays: isCredit.value ? Number(debtTermDays.value) || 0 : 0,
        recipientName: recipientName.value?.trim() || null,
        recipientPhone: recipientPhone.value?.trim() || null,
        deliveryAddress: deliveryAddress.value?.trim() || null,
        needsVatInvoice: needsVatInvoice.value,
        invoiceBuyerType: needsVatInvoice.value ? invoiceBuyerType.value : null,
        invoiceBuyerName: needsVatInvoice.value ? invoiceBuyerName.value?.trim() || null : null,
        invoiceTaxCode: needsVatInvoice.value ? invoiceTaxCode.value?.trim() || null : null,
        invoiceAddress: needsVatInvoice.value ? invoiceAddress.value?.trim() || null : null,
        invoiceEmail: needsVatInvoice.value ? invoiceEmail.value?.trim() || null : null,
        saveInvoiceToCustomer: needsVatInvoice.value && saveInvoiceToCustomer.value,
        assignedSaleId: assignedSaleId.value || null,
        referrerName: referrerName.value?.trim() || null,
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
    customerDetail,
    selectedTier,
    items,
    shippingMethod,
    paymentMethod,
    shippingFee,
    paidAmount,
    debtTermDays,
    note,
    recipientName,
    recipientPhone,
    deliveryAddress,
    needsVatInvoice,
    invoiceBuyerType,
    invoiceBuyerName,
    invoiceTaxCode,
    invoiceAddress,
    invoiceEmail,
    saveInvoiceToCustomer,
    staffList,
    assignedSaleId,
    referrerName,
    invoicingCompany,
    loadStaff,
    submitting,
    subtotal,
    totalDiscount,
    totalAmount,
    isCredit,
    debtAmount,
    itemCount,
    selectCustomer,
    clearCustomer,
    loadCustomerDetail,
    clearAll,
    buildOrderSnapshot,
    addProduct,
    updateQuantity,
    updateUnitPrice,
    updateDiscount,
    removeProduct,
    changeTier,
    reset,
    loadCartFromOrder,
    submitOrder,
  };
});
