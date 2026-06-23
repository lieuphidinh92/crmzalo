/**
 * Sinh mã KH cho từng org. Format: `KH001` → `KH999` → `KH1000+` (giữ
 * 3 chữ số tối thiểu, không pad tiếp khi vượt nghìn).
 *
 * Concurrent-safe ở mức "đủ tốt": dùng transaction Serializable để 2 POST
 * cùng lúc không cấp trùng mã. Khi schema thêm `@@unique([orgId, customerCode])`
 * (làm sau khi backfill xong), Prisma sẽ là chốt cuối — đụng unique thì retry.
 */

import pkg from '@prisma/client';
const { Prisma } = pkg;
import { prisma } from '../../shared/database/prisma-client.js';

const PREFIX = 'KH';
const MIN_PAD = 3;

/** "KH012" → 12. Trả null nếu không match format. */
export function parseCustomerCode(code: string | null | undefined): number | null {
  if (!code) return null;
  const m = /^KH(\d+)$/.exec(code);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/** 12 → "KH012". 1000 → "KH1000". */
export function formatCustomerCode(n: number): string {
  return PREFIX + String(n).padStart(MIN_PAD, '0');
}

/**
 * Cấp mã tiếp theo cho 1 org. Quét MAX(numeric) hiện có rồi +1. Chạy
 * trong transaction Serializable để chống race khi 2 POST song song.
 *
 * KHÔNG ghi vào contacts ở đây — caller phải `prisma.contact.create()`
 * trong CÙNG transaction để khoá hiệu quả. Vì Prisma không expose nested
 * transaction handle qua tham số dễ, ta accept một `tx` optional.
 */
export async function getNextCustomerCode(
  orgId: string,
  tx?: any,
): Promise<string> {
  const client = tx ?? prisma;
  // Lấy mã max hiện có trong org. Cast text → int khi match `KH\d+` để sort
  // đúng cách (KH9 < KH10, KH99 < KH100). Bỏ qua row có customer_code NULL
  // hoặc không khớp format.
  const rows = await client.$queryRaw<Array<{ max_num: number | null }>>(Prisma.sql`
    SELECT MAX(CAST(SUBSTRING(customer_code FROM 3) AS INTEGER)) AS max_num
    FROM contacts
    WHERE org_id = ${orgId}
      AND customer_code ~ '^KH[0-9]+$'
  `);
  const current = rows[0]?.max_num ?? 0;
  return formatCustomerCode(current + 1);
}
