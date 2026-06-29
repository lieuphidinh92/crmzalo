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
};
