/**
 * use-screen-cache — giữ nguyên màn hình khi quay lại, làm mới ngầm nếu dữ liệu cũ.
 *
 * Vì sao cần (đo 25/8/2026): mỗi màn gọi 1–4 API, mỗi lần gọi tốn ~85ms mạng
 * (máy chủ ở Singapore) và app KHÔNG cache gì — rời màn rồi quay lại là tải lại
 * sạch từ đầu, nhân viên phải nhìn khung xám mỗi lần chuyển qua chuyển lại.
 *
 * Cách chạy, phối hợp với <KeepAlive> ở MainLayout:
 *   - Lần đầu vào màn  → tải bình thường (có khung chờ).
 *   - Quay lại màn     → hiện NGAY dữ liệu cũ (KeepAlive giữ nguyên state, cả
 *                        bộ lọc lẫn vị trí cuộn), rồi tự làm mới NGẦM nếu dữ liệu
 *                        quá `ttl`. Không chớp khung xám.
 *
 * ⛔ KHÔNG dùng cho màn Công nợ và Tồn kho: hai chỗ đó sai số là sai tiền/sai
 * hàng, luôn phải gọi mới.
 *
 * Hàm `load` nhận tham số `silent`: khi true thì ĐỪNG bật khung chờ (giữ dữ liệu
 * cũ trên màn), chỉ thay số khi có kết quả mới.
 */
import { ref, onMounted, onActivated } from 'vue';

/** Số tác vụ đang chạy ngầm — TopBar hiện thanh mảnh khi > 0. */
export const bgTasks = ref(0);

/**
 * Quyết định có làm mới ngầm khi quay lại màn hay không. Tách riêng để test được
 * bằng Node (dự án không có công cụ chạy DOM).
 *   lastAt = 0 → chưa tải lần nào, onMounted lo, KHÔNG tải thêm (tránh gọi 2 lần).
 */
export function shouldRefresh(lastAt, ttl, now = Date.now()) {
  if (!lastAt) return false;
  return now - lastAt > ttl;
}

export function useScreenCache(load, { ttl = 60_000 } = {}) {
  const lastAt = ref(0);
  let inflight = null;

  async function run(silent) {
    // Chặn gọi chồng: đổi tab nhanh hoặc bấm nhiều lần chỉ chạy 1 lượt.
    if (inflight) return inflight;
    if (silent) bgTasks.value++;
    inflight = Promise.resolve()
      .then(() => load(silent))
      .finally(() => {
        inflight = null;
        lastAt.value = Date.now();
        if (silent) bgTasks.value = Math.max(0, bgTasks.value - 1);
      });
    return inflight;
  }

  onMounted(() => {
    if (!lastAt.value) run(false);
  });

  // Vue bắn onActivated ngay sau lần mount đầu → `lastAt` chặn tải 2 lần.
  onActivated(() => {
    if (shouldRefresh(lastAt.value, ttl)) run(true);
  });

  return {
    lastAt,
    /** Gọi tay khi cần (đổi bộ lọc, vừa sửa dữ liệu xong...). */
    refresh: (silent = true) => run(silent),
    /** Đánh dấu dữ liệu đã cũ để lần quay lại màn sau chắc chắn tải mới. */
    invalidate: () => {
      lastAt.value = 1;
    },
  };
}
