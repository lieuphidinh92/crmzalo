/**
 * tax-lookup-routes.ts — tra cứu thông tin người nộp thuế theo MST.
 *
 * Sale nhập MST của khách → bấm "Tra cứu" → tự điền TÊN ĐƠN VỊ + ĐỊA CHỈ vào
 * form xuất VAT (sale-app: `VatRequestDrawer.vue` khi xin hoá đơn và
 * `AdvancedOptions.vue` lúc tạo đơn ở POS). Nguồn: VietQR, tổng hợp từ Trang
 * thông tin điện tử của Cục Thuế (gdt.gov.vn).
 *
 * Vì sao đi qua backend chứ không gọi thẳng từ trình duyệt (anh Philip chốt 25/8/2026):
 *   1. Hạn mức VietQR đo thật là **2 lượt / 20 giây / mỗi IP** → phải cache, MST
 *      đã tra 1 lần thì cả công ty dùng lại, khỏi đốt hạn mức.
 *   2. Hôm nào VietQR tắt CORS `*` là nút chết mà frontend không chữa được; đổi
 *      nhà cung cấp ở đây thì chỉ sửa 1 file, không phải deploy lại 2 app.
 *   3. Cổng ngoài chết KHÔNG được chặn sale gửi yêu cầu VAT — mọi lỗi trả về đều
 *      là lỗi MỀM kèm câu "nhập tay giúp em", frontend chỉ hiện cảnh báo.
 *
 * ⚠️ Dữ liệu thuế TRỄ (VietQR tự ghi "9 ngày trước" trong `metadata.disclaimer`)
 * → luôn để sale sửa lại tay sau khi tự điền, đừng khoá ô.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';

const VIETQR_BUSINESS_URL = 'https://api.vietqr.io/v2/business';

/** Cổng ngoài chậm thì thà báo lỗi mềm còn hơn để sale ngồi chờ xoay vòng. */
const UPSTREAM_TIMEOUT_MS = 8000;

/**
 * Cache RAM 7 ngày. Cố ý KHÔNG tạo bảng mới: thông tin đơn vị đổi rất chậm
 * (chính VietQR còn cache 9 ngày–2 tháng), và hồ sơ VAT của khách đã được lưu
 * vào `contacts.invoice*` khi sale tick "Lưu thông tin cho lần sau" — cache này
 * chỉ để chống bấm liên tục cùng 1 mã. Render restart mất cache là bình thường.
 */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

type TaxPayerInfo = {
  taxCode: string;
  name: string;
  shortName: string | null;
  internationalName: string | null;
  address: string;
  status: string;
  /** true = "NNT đang hoạt động". false → frontend cảnh báo trước khi xuất hoá đơn. */
  active: boolean;
  /** Mốc Cục Thuế cập nhật (theo VietQR) — để hiện "dữ liệu ngày ..." cho sale. */
  sourceUpdatedAt: string | null;
};

const cache = new Map<string, { at: number; data: TaxPayerInfo }>();

function cacheGet(taxCode: string): { data: TaxPayerInfo; fresh: boolean } | null {
  const hit = cache.get(taxCode);
  if (!hit) return null;
  return { data: hit.data, fresh: Date.now() - hit.at < CACHE_TTL_MS };
}

function cacheSet(taxCode: string, data: TaxPayerInfo): void {
  // Map giữ thứ tự chèn → key đầu tiên là cũ nhất, xoá dần cho khỏi phình RAM.
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(taxCode, { at: Date.now(), data });
}

/**
 * Chuẩn hoá MST người dùng gõ: bỏ khoảng trắng, dấu chấm, gạch lạ.
 * Hợp lệ: 10 số (đơn vị) hoặc 13 số (chi nhánh) — trả về dạng `1234567890-001`.
 * Trả `null` nếu không đúng khuôn → chặn ngay, không gọi ra ngoài cho tốn hạn mức.
 */
export function normalizeTaxCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 13) return `${digits.slice(0, 10)}-${digits.slice(10)}`;
  return null;
}

/** VietQR trả `status` dạng câu tiếng Việt, không phải mã — dò theo chữ. */
function isActiveStatus(status: string): boolean {
  return /đang hoạt động/i.test(status);
}

type VietQrResponse = {
  code?: string;
  desc?: string;
  data?: {
    id?: string;
    name?: string;
    shortName?: string | null;
    internationalName?: string | null;
    address?: string;
    status?: string;
  } | null;
  metadata?: { updatedAt?: string } | null;
};

class UpstreamError extends Error {
  constructor(
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
  }
}

async function fetchFromVietQr(taxCode: string): Promise<TaxPayerInfo> {
  let res: Response;
  try {
    res = await fetch(`${VIETQR_BUSINESS_URL}/${encodeURIComponent(taxCode)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    logger.warn('[tax-lookup] không gọi được VietQR', taxCode, err);
    throw new UpstreamError(503, 'Không kết nối được cổng tra cứu MST. Anh/chị nhập tay giúp em.');
  }

  if (res.status === 429) {
    throw new UpstreamError(
      429,
      'Cổng tra cứu đang quá tải (chỉ cho 2 lượt mỗi 20 giây). Chờ ~20 giây rồi tra lại, hoặc nhập tay.',
    );
  }
  if (!res.ok) {
    logger.warn('[tax-lookup] VietQR trả HTTP', res.status, taxCode);
    throw new UpstreamError(503, 'Cổng tra cứu MST đang lỗi. Anh/chị nhập tay giúp em.');
  }

  let body: VietQrResponse;
  try {
    body = (await res.json()) as VietQrResponse;
  } catch {
    throw new UpstreamError(503, 'Cổng tra cứu MST trả dữ liệu lạ. Anh/chị nhập tay giúp em.');
  }

  // code '51' = "Tax not found". Coi là 404 để frontend nói đúng câu cho sale.
  if (body.code !== '00' || !body.data?.name) {
    throw new UpstreamError(
      404,
      'Không tìm thấy mã số thuế này trong dữ liệu Cục Thuế. Kiểm tra lại số, hoặc nhập tay.',
    );
  }

  const d = body.data;
  const status = (d.status || '').trim();
  return {
    taxCode: (d.id || taxCode).trim(),
    name: (d.name || '').trim(),
    shortName: d.shortName?.trim() || null,
    internationalName: d.internationalName?.trim() || null,
    address: (d.address || '').trim(),
    status,
    active: isActiveStatus(status),
    sourceUpdatedAt: body.metadata?.updatedAt || null,
  };
}

/**
 * Giới hạn theo TỪNG user (token), không theo IP: cả phòng sale ngồi chung wifi
 * công ty là chung 1 IP, chặn theo IP thành ra chặn oan người bên cạnh.
 * keyGenerator chạy ở onRequest — lúc đó `request.user` chưa có, nên dùng header.
 */
const perUserRateLimit = {
  config: {
    rateLimit: {
      max: 20,
      timeWindow: '1 minute',
      keyGenerator: (request: FastifyRequest) =>
        (request.headers.authorization as string | undefined) ?? request.ip,
      // Mặc định plugin trả câu tiếng Anh "Rate limit exceeded..." — sale sẽ thấy
      // đúng chữ đó trên form (frontend đọc `data.error`). Viết lại cho người.
      //
      // ⚠️ Hình dạng trả về rất kén, đo thật 25/8/2026 (@fastify/rate-limit 10):
      // plugin `throw` THẲNG thứ hàm này trả ra, và lỗi đó KHÔNG đi qua
      // `setErrorHandler` của app. Nên:
      //   - object thuần `{ error }`               → HTTP 500 (mất status 429)
      //   - `new Error(msg)` + `statusCode = 429`  → 429 nhưng body thành
      //     `{ error: 'Too Many Requests', message: <câu Việt> }` → FE vẫn hiện chữ Anh
      //   - object `{ statusCode: 429, error }`    → ✅ 429 + FE đọc đúng câu Việt
      // Đổi hình dạng này thì phải bấm thử 21 lần lại, đừng tin suy luận.
      errorResponseBuilder: () =>
        ({
          statusCode: 429,
          error: 'Tra cứu quá nhanh, chờ khoảng 1 phút rồi thử lại giúp em (hoặc nhập tay).',
        }) as unknown as Error,
    },
  },
};

export async function taxLookupRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get(
    '/api/v1/tax-lookup',
    perUserRateLimit,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { taxCode: rawTaxCode } = request.query as { taxCode?: string };
      const taxCode = normalizeTaxCode(rawTaxCode);
      if (!taxCode) {
        return reply
          .status(400)
          .send({ error: 'Mã số thuế phải là 10 số (hoặc 13 số dạng 1234567890-001).' });
      }

      const cached = cacheGet(taxCode);
      if (cached?.fresh) {
        return { ...cached.data, cached: true };
      }

      try {
        const info = await fetchFromVietQr(taxCode);
        cacheSet(taxCode, info);
        return { ...info, cached: false };
      } catch (err) {
        // Cổng ngoài lỗi mà trong cache còn bản cũ (quá 7 ngày) thì vẫn trả ra —
        // tên/địa chỉ đơn vị 7 ngày trước gần như chắc chắn còn đúng, hơn là để
        // sale trắng tay. Đánh dấu `stale` để frontend nói rõ đây là bản cũ.
        if (cached) {
          logger.warn('[tax-lookup] dùng cache cũ vì cổng ngoài lỗi', taxCode);
          return { ...cached.data, cached: true, stale: true };
        }
        if (err instanceof UpstreamError) {
          return reply.status(err.httpStatus).send({ error: err.message });
        }
        logger.error('[tax-lookup] lỗi không lường được', err);
        return reply
          .status(503)
          .send({ error: 'Không tra cứu được MST lúc này. Anh/chị nhập tay giúp em.' });
      }
    },
  );
}
