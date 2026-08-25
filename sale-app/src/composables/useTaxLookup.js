/**
 * useTaxLookup — tra cứu tên + địa chỉ đơn vị theo mã số thuế.
 *
 * Dùng chung cho 2 chỗ có ô Mã số thuế:
 *   - `VatRequestDrawer.vue`  (sale xin xuất hoá đơn cho đơn đã hoàn tất)
 *   - `AdvancedOptions.vue`   (khai thông tin hoá đơn ngay lúc tạo đơn ở POS)
 *
 * Gọi qua backend `GET /api/v1/tax-lookup` (không gọi thẳng VietQR từ trình
 * duyệt) — lý do và hạn mức ghi ở `backend/src/modules/orders/tax-lookup-routes.ts`.
 *
 * Luật: tra cứu chỉ ĐIỀN GIÚP, không bao giờ chặn. Cổng ngoài lỗi thì hiện cảnh
 * báo, sale vẫn nhập tay và gửi được như trước.
 */
import { ref } from 'vue';
import { api } from '../api/client';

/** Hợp lệ: 10 số, hoặc 13 số (chi nhánh) — chấp cả khi sale gõ kèm dấu chấm/gạch. */
export function taxCodeDigits(raw) {
  return String(raw || '').replace(/[^\d]/g, '');
}
export function isLookupableTaxCode(raw) {
  const n = taxCodeDigits(raw).length;
  return n === 10 || n === 13;
}

export function useTaxLookup() {
  const looking = ref(false);
  const lookupError = ref('');
  /** Kết quả lần tra gần nhất — để hiện trạng thái MST + nút Hoàn tác. */
  const lookupResult = ref(null);
  /** Giá trị 2 ô trước khi bị ghi đè, cho nút "Hoàn tác". */
  const undoSnapshot = ref(null);

  function reset() {
    looking.value = false;
    lookupError.value = '';
    lookupResult.value = null;
    undoSnapshot.value = null;
  }

  /**
   * Tra MST rồi ghi tên + địa chỉ vào form.
   *
   * @param taxCode  MST sale đang gõ
   * @param apply    hàm ghi vào form: ({ name, address }) => void
   * @param snapshot hàm đọc giá trị hiện tại để lưu cho Hoàn tác: () => ({ name, address })
   */
  async function lookup(taxCode, apply, snapshot) {
    lookupError.value = '';
    lookupResult.value = null;
    undoSnapshot.value = null;

    if (!isLookupableTaxCode(taxCode)) {
      lookupError.value = 'Mã số thuế phải là 10 số (hoặc 13 số dạng 1234567890-001).';
      return null;
    }

    looking.value = true;
    try {
      const { data } = await api.get('/tax-lookup', { params: { taxCode } });
      // Chụp giá trị cũ TRƯỚC khi ghi đè — sale bấm tra cứu là chủ động muốn lấy
      // số mới, nên cứ điền thẳng, nhưng phải cho đường lùi.
      undoSnapshot.value = snapshot ? { ...snapshot() } : null;
      lookupResult.value = data;
      apply({ name: data.name || '', address: data.address || '' });
      return data;
    } catch (err) {
      lookupError.value =
        err?.response?.data?.error || 'Không tra cứu được MST lúc này. Anh/chị nhập tay giúp em.';
      return null;
    } finally {
      looking.value = false;
    }
  }

  /** Trả 2 ô về giá trị trước khi tra cứu. */
  function undo(apply) {
    if (!undoSnapshot.value) return;
    apply({ ...undoSnapshot.value });
    undoSnapshot.value = null;
    lookupResult.value = null;
  }

  return { looking, lookupError, lookupResult, undoSnapshot, lookup, undo, reset };
}
