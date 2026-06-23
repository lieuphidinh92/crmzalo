/**
 * SĐT chuẩn hoá cho KH B2B sỉ Việt Nam.
 *
 * Quy tắc anh Philip duyệt (PR1 — KH-list refactor):
 *   - Output: đúng 10 chữ số, bắt đầu bằng `0`.
 *   - `+84xxxxxxxxx` / `84xxxxxxxxx` (11 số bắt đầu 84) → đổi tiền tố thành `0`.
 *   - 9 số (không có `0` đầu) → prepend `0`.
 *   - 10 số bắt đầu `0` → giữ nguyên.
 *   - Mọi ký tự không phải digit (space, `.`, `-`, `(`, `)`) đều bị loại trước
 *     khi check format. `+` chỉ có ý nghĩa với prefix `+84`.
 *   - Empty / null / không nhận diện được → trả `{ ok: false }` để caller
 *     quyết: backfill thì log report, API thì trả 400.
 */

export type NormalizePhoneResult =
  | { ok: true; value: string }
  | { ok: false; reason: 'empty' | 'invalid_length' | 'invalid_prefix' };

const VN_PHONE_LEN = 10;

export function normalizePhone(raw: unknown): NormalizePhoneResult {
  if (raw === null || raw === undefined) return { ok: false, reason: 'empty' };
  const s = String(raw).trim();
  if (!s) return { ok: false, reason: 'empty' };

  // Strip mọi ký tự không phải digit. Giữ lại `+` tạm thời để xử lý `+84`.
  const hasPlusPrefix = s.startsWith('+');
  const digits = s.replace(/\D/g, '');
  if (!digits) return { ok: false, reason: 'empty' };

  // Case 1: `+84xxxxxxxxx` (11 số sau strip vì `+` đã bị loại).
  // Case 2: `84xxxxxxxxx` không có `+` — chỉ áp dụng nếu đúng 11 số và
  // bắt đầu bằng `84`. Tránh dính trường hợp số 10 số bắt đầu `84` (không
  // có ở VN nhưng vẫn defensive).
  if (digits.length === 11 && digits.startsWith('84')) {
    const tail = digits.slice(2);
    if (tail.length === 9) return { ok: true, value: '0' + tail };
    return { ok: false, reason: 'invalid_length' };
  }

  // Case 3: 10 số bắt đầu `0` — chuẩn.
  if (digits.length === VN_PHONE_LEN && digits.startsWith('0')) {
    return { ok: true, value: digits };
  }

  // Case 4: 9 số (thiếu `0` đầu) — prepend.
  if (digits.length === 9) {
    return { ok: true, value: '0' + digits };
  }

  // `+` mà không phải `+84` → từ chối.
  if (hasPlusPrefix) return { ok: false, reason: 'invalid_prefix' };

  return { ok: false, reason: 'invalid_length' };
}

/**
 * Convenience cho call-site không quan tâm reason: trả string đã chuẩn hoá
 * hoặc null. Dùng trong PUT/POST khi chỉ cần "đúng dạng VN hay không".
 */
export function normalizePhoneOrNull(raw: unknown): string | null {
  const r = normalizePhone(raw);
  return r.ok ? r.value : null;
}
