/**
 * Centralized configuration loader.
 * All environment variables are read once at startup and typed here.
 */
export const config = {
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  encryptionKey: process.env.ENCRYPTION_KEY || 'dev-key-change-me-16b',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://crmuser:password@localhost:5432/zalocrm',
  uploadDir: process.env.UPLOAD_DIR || '/var/lib/zalo-crm/files',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  publicUrl: process.env.PUBLIC_URL || process.env.APP_URL || 'http://localhost:3000',
  isProduction: process.env.NODE_ENV === 'production',
  pancakeApiKey: process.env.PANCAKE_API_KEY || '',
  // Supabase Storage — lưu ảnh chứng từ thanh toán (proof). Bỏ trống ở local
  // nếu chưa cấu hình; upload sẽ trả lỗi rõ ràng thay vì crash.
  supabaseUrl: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || '',
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET || 'payment-proofs',

  // ── Notification Service (27/8/2026) ──────────────────────────────────────
  // Credentials CHỈ ở env (Render → Environment, sync:false trong render.yaml).
  // Bật/tắt từng kênh theo nhóm người nhận thì để trong bảng `app_settings` —
  // đổi được mà không phải deploy lại.
  // Tắt hẳn mọi thông báo ra ngoài (dùng khi test/nghỉ lễ): NOTIFY_ENABLED=false.
  notifyEnabled: (process.env.NOTIFY_ENABLED || 'true') !== 'false',
  // Webhook "Custom Bot" của nhóm Lark "Xuất Nhập Kho". Trống ở local → service
  // tự rơi về LogProvider (ghi ra console), không crash.
  larkWebhookAccounting: process.env.LARK_WEBHOOK_ACCOUNTING || '',
  // Chỉ cần khi bật "Chữ ký" (Signature verification) trong cài đặt bot Lark.
  larkSecretAccounting: process.env.LARK_WEBHOOK_SECRET_ACCOUNTING || '',
  // Phase 2 — danh sách email kế toán, ngăn cách bằng dấu phẩy.
  notifyAccountingEmails: process.env.NOTIFY_ACCOUNTING_EMAILS || '',
  // Gốc link trong thông báo. Màn "Xuất VAT" của kế toán nằm ở SALE-APP
  // (sale.halo.com.vn/vat/requested), KHÔNG phải CRM.
  saleAppUrl: (process.env.SALE_APP_URL || 'https://sale.halo.com.vn').replace(/\/+$/, ''),
};
