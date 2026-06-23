/**
 * Backfill chuẩn hoá SĐT cho toàn bộ contacts hiện có.
 *
 * Mặc định là **dry-run**: chỉ in ra
 *   - Số KH sẽ được normalize (raw → normalized).
 *   - Số KH không normalize được (giữ nguyên, hiển thị reason).
 *   - **Các nhóm SĐT trùng sau normalize** (export sang
 *     `var/phone-duplicates-<timestamp>.json` để anh Philip review).
 *
 * KHÔNG ghi DB nếu phát hiện trùng. Anh quyết merge/giữ rồi mới chạy
 * `--apply` (chỉ ghi các normalize KHÔNG trùng).
 *
 * Usage:
 *   npx tsx scripts/normalize-existing-phones.ts           # dry-run
 *   npx tsx scripts/normalize-existing-phones.ts --apply   # ghi DB (sau khi review)
 *
 * Idempotent: chạy nhiều lần — SĐT đã chuẩn rồi sẽ không bị đụng.
 */

import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { normalizePhone } from '../src/shared/utils/phone.js';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (sẽ ghi DB)' : 'DRY-RUN (không ghi DB)'}`);

  const contacts = await prisma.contact.findMany({
    select: { id: true, orgId: true, fullName: true, phone: true, customerCode: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`Tổng số KH: ${contacts.length}`);

  type Row = {
    id: string;
    orgId: string;
    fullName: string | null;
    customerCode: string | null;
    rawPhone: string | null;
    normalizedPhone: string | null;
    status: 'unchanged' | 'will_normalize' | 'invalid' | 'empty';
    reason?: string;
  };

  const rows: Row[] = [];
  for (const c of contacts) {
    if (!c.phone || !c.phone.trim()) {
      rows.push({
        id: c.id,
        orgId: c.orgId,
        fullName: c.fullName,
        customerCode: c.customerCode,
        rawPhone: c.phone,
        normalizedPhone: null,
        status: 'empty',
      });
      continue;
    }
    const r = normalizePhone(c.phone);
    if (!r.ok) {
      rows.push({
        id: c.id,
        orgId: c.orgId,
        fullName: c.fullName,
        customerCode: c.customerCode,
        rawPhone: c.phone,
        normalizedPhone: null,
        status: 'invalid',
        reason: r.reason,
      });
      continue;
    }
    rows.push({
      id: c.id,
      orgId: c.orgId,
      fullName: c.fullName,
      customerCode: c.customerCode,
      rawPhone: c.phone,
      normalizedPhone: r.value,
      status: r.value === c.phone ? 'unchanged' : 'will_normalize',
    });
  }

  // Group by (orgId, normalizedPhone) để tìm trùng.
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.normalizedPhone) continue;
    const key = `${r.orgId}::${r.normalizedPhone}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  const duplicates = Array.from(groups.entries())
    .filter(([_, arr]) => arr.length > 1)
    .map(([key, arr]) => {
      const [orgId, normalizedPhone] = key.split('::');
      return {
        orgId,
        normalizedPhone,
        count: arr.length,
        contacts: arr.map(r => ({
          id: r.id,
          customerCode: r.customerCode,
          fullName: r.fullName,
          rawPhone: r.rawPhone,
        })),
      };
    });

  const counts = {
    total: rows.length,
    empty: rows.filter(r => r.status === 'empty').length,
    unchanged: rows.filter(r => r.status === 'unchanged').length,
    willNormalize: rows.filter(r => r.status === 'will_normalize').length,
    invalid: rows.filter(r => r.status === 'invalid').length,
    duplicateGroups: duplicates.length,
    contactsInDuplicateGroups: duplicates.reduce((s, g) => s + g.count, 0),
  };

  console.log('\n=== TỔNG KẾT ===');
  console.table(counts);

  if (counts.invalid > 0) {
    console.log('\n=== KH có SĐT không nhận diện được (giữ nguyên) ===');
    for (const r of rows.filter(x => x.status === 'invalid')) {
      console.log(
        `  ${r.customerCode ?? '???'} | ${r.fullName ?? '(chưa tên)'} | raw="${r.rawPhone}" (${r.reason})`,
      );
    }
  }

  if (counts.willNormalize > 0 && counts.willNormalize <= 30) {
    console.log('\n=== KH sẽ được normalize (xem trước) ===');
    for (const r of rows.filter(x => x.status === 'will_normalize').slice(0, 30)) {
      console.log(
        `  ${r.customerCode ?? '???'} | ${r.fullName ?? '(chưa tên)'} | ${r.rawPhone} → ${r.normalizedPhone}`,
      );
    }
  }

  // Dump duplicates report
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = resolve(process.cwd(), `var/phone-duplicates-${ts}.json`);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        counts,
        duplicates,
        invalid: rows.filter(r => r.status === 'invalid'),
        willNormalizeSample: rows.filter(r => r.status === 'will_normalize').slice(0, 100),
      },
      null,
      2,
    ),
  );
  console.log(`\nReport: ${reportPath}`);

  if (counts.duplicateGroups > 0) {
    console.log(
      `\n⚠️  Phát hiện ${counts.duplicateGroups} nhóm SĐT trùng (${counts.contactsInDuplicateGroups} KH).`,
    );
    if (APPLY) {
      console.log(
        '   --apply bị TỪ CHỐI vì còn trùng. Anh review report rồi gộp/sửa KH trùng trước.',
      );
      await prisma.$disconnect();
      process.exit(2);
    }
    console.log('   Mở report ở trên để xem chi tiết, quyết định gộp/đổi rồi chạy lại.');
  }

  if (!APPLY) {
    console.log('\nDRY-RUN xong. Chạy lại với --apply để ghi DB (chỉ khi không còn trùng).');
    await prisma.$disconnect();
    return;
  }

  // APPLY: chỉ ghi các willNormalize. Bỏ qua invalid (giữ raw).
  const toUpdate = rows.filter(r => r.status === 'will_normalize');
  console.log(`\nĐang ghi ${toUpdate.length} contacts...`);
  let done = 0;
  for (const r of toUpdate) {
    await prisma.contact.update({
      where: { id: r.id },
      data: { phone: r.normalizedPhone },
    });
    done++;
    if (done % 50 === 0) console.log(`  ${done}/${toUpdate.length}`);
  }
  console.log(`Xong. Đã update ${done} contacts.`);
  await prisma.$disconnect();
}

main().catch(async err => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
