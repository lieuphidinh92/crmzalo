/**
 * Supabase Storage helper — đẩy ảnh chứng từ thanh toán lên bucket public,
 * trả về URL công khai để lưu vào DB (CustomerPayment.proofUrl).
 *
 * Dùng REST API của Supabase Storage qua global fetch (Node 18+) nên KHÔNG
 * cần thêm thư viện @supabase/supabase-js.
 *
 * Cấu hình env (chỉ cần ở môi trường có upload thật — prod Render, và local
 * nếu muốn test):
 *   SUPABASE_URL            = https://<project-ref>.supabase.co
 *   SUPABASE_SERVICE_KEY    = service_role key (Settings → API → service_role)
 *   SUPABASE_STORAGE_BUCKET = payment-proofs (mặc định)
 *
 * Bucket phải đặt PUBLIC để URL trả về đọc được không cần token.
 */
import { config } from '../../config/index.js';
import { logger } from '../utils/logger.js';

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export function storageConfigured(): boolean {
  return Boolean(config.supabaseUrl && config.supabaseServiceKey);
}

export function extForMime(mime: string): string | null {
  return ALLOWED_MIME[mime.toLowerCase()] ?? null;
}

/**
 * Upload một file lên Supabase Storage và trả về URL công khai.
 * @param buffer  nội dung file
 * @param mime    content-type (phải nằm trong ALLOWED_MIME)
 * @param prefix  thư mục logic trong bucket, vd "proofs"
 * @param idHint  chuỗi để tạo tên file dễ truy vết (vd orgId hoặc contactId)
 */
export async function uploadToStorage(
  buffer: Buffer,
  mime: string,
  prefix: string,
  idHint: string,
): Promise<string> {
  if (!storageConfigured()) {
    throw Object.assign(new Error('Chưa cấu hình lưu trữ ảnh (SUPABASE_URL/SUPABASE_SERVICE_KEY)'), {
      statusCode: 503,
    });
  }
  const ext = extForMime(mime);
  if (!ext) {
    throw Object.assign(new Error('Định dạng file không hỗ trợ (chỉ JPG/PNG/WEBP/PDF)'), {
      statusCode: 400,
    });
  }

  const bucket = config.supabaseStorageBucket;
  // Tên file ngẫu nhiên + truy vết: <prefix>/<idHint>/<random>.<ext>
  const rand = `${Date.now().toString(36)}-${Math.round(Math.random() * 1e9).toString(36)}`;
  const safeHint = (idHint || 'x').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'x';
  const objectPath = `${prefix}/${safeHint}/${rand}.${ext}`;

  const url = `${config.supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      // Gửi cả `apikey` + `Authorization: Bearer` để tương thích cả key kiểu
      // mới (sb_secret_…) lẫn service_role JWT cũ.
      apikey: config.supabaseServiceKey,
      Authorization: `Bearer ${config.supabaseServiceKey}`,
      'Content-Type': mime,
      'x-upsert': 'false',
      'cache-control': '3600',
    },
    body: buffer as any,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.error(`[storage] upload failed ${res.status}: ${text}`);
    if (res.status === 404) {
      throw Object.assign(
        new Error(`Bucket "${bucket}" chưa tồn tại trên Supabase Storage`),
        { statusCode: 503 },
      );
    }
    throw Object.assign(new Error('Lỗi lưu ảnh chứng từ lên kho lưu trữ'), { statusCode: 502 });
  }

  // URL công khai (bucket phải để public).
  return `${config.supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`;
}
