/**
 * Ép múi giờ Việt Nam cho TOÀN BỘ process — PHẢI import ĐẦU TIÊN trong app.ts,
 * trước mọi module khác, để các phép tính ngày (startOfDay/Week/Month dùng giờ
 * local) ra đúng giờ VN kể cả khi server (Render) mặc định chạy UTC.
 *
 * Tôn trọng env TZ nếu đã set (vd render.yaml) → cho phép override khi cần.
 */
process.env.TZ = process.env.TZ || 'Asia/Ho_Chi_Minh';
