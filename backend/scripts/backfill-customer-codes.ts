/**
 * Backfill mã KH cho contacts chưa có customer_code.
 *
 * Quy tắc:
 *   - Sắp xếp theo `createdAt ASC` rồi gán KH001, KH002... PER ORG.
 *   - KH đã có customerCode khớp format `KH\d+` → giữ nguyên (idempotent).
 *   - Nếu org đã có một số KH có mã, bộ đếm bắt đầu từ MAX hiện có +1
 *     để không trùng. Các KH chưa có mã (cũ hơn nhiều) sẽ bị nhét cuối —
 *     anh quyết: chấp nhận thứ tự không hoàn hảo, hay xoá hết mã đang
 *     có rồi backfill lại (mặc định: giữ mã hiện có).
 *
 * Usage:
 *   npx tsx scripts/backfill-customer-codes.ts          # dry-run
 *   npx tsx scripts/backfill-customer-codes.ts --apply  # ghi DB
 */

import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';

import {
  formatCustomerCode,
  parseCustomerCode,
} from '../src/modules/contacts/customer-code-service.js';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (sẽ ghi DB)' : 'DRY-RUN (không ghi DB)'}`);

  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  console.log(`Tổng org: ${orgs.length}`);

  for (const org of orgs) {
    const contacts = await prisma.contact.findMany({
      where: { orgId: org.id },
      select: { id: true, fullName: true, customerCode: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Tìm max numeric trong org
    let maxNum = 0;
    for (const c of contacts) {
      const n = parseCustomerCode(c.customerCode);
      if (n !== null && n > maxNum) maxNum = n;
    }

    const toAssign = contacts.filter(c => parseCustomerCode(c.customerCode) === null);
    console.log(`\nOrg "${org.name}" (${org.id}):`);
    console.log(`  Tổng KH: ${contacts.length}`);
    console.log(`  Đã có mã: ${contacts.length - toAssign.length}`);
    console.log(`  Cần gán: ${toAssign.length}`);
    console.log(`  Mã max hiện có: KH${maxNum.toString().padStart(3, '0')}`);
    console.log(`  Sẽ bắt đầu từ: KH${(maxNum + 1).toString().padStart(3, '0')}`);

    if (toAssign.length === 0) continue;

    // Preview 5 cái đầu + 5 cái cuối
    console.log('  Preview (5 đầu):');
    let n = maxNum;
    for (let i = 0; i < Math.min(5, toAssign.length); i++) {
      n++;
      console.log(
        `    ${formatCustomerCode(n)} ← "${toAssign[i].fullName ?? '(chưa tên)'}" (created ${toAssign[i].createdAt.toISOString().slice(0, 10)})`,
      );
    }
    if (toAssign.length > 10) console.log(`    ... ${toAssign.length - 10} dòng giữa ...`);
    if (toAssign.length > 5) {
      console.log('  Preview (5 cuối):');
      const startTail = Math.max(5, toAssign.length - 5);
      let nTail = maxNum + startTail;
      for (let i = startTail; i < toAssign.length; i++) {
        nTail++;
        console.log(
          `    ${formatCustomerCode(nTail)} ← "${toAssign[i].fullName ?? '(chưa tên)'}" (created ${toAssign[i].createdAt.toISOString().slice(0, 10)})`,
        );
      }
    }

    if (!APPLY) continue;

    // APPLY: ghi từng row
    let counter = maxNum;
    let done = 0;
    for (const c of toAssign) {
      counter++;
      await prisma.contact.update({
        where: { id: c.id },
        data: { customerCode: formatCustomerCode(counter) },
      });
      done++;
      if (done % 50 === 0) console.log(`  ${done}/${toAssign.length}`);
    }
    console.log(`  Xong: đã gán ${done} mã.`);
  }

  if (!APPLY) {
    console.log('\nDRY-RUN xong. Chạy lại với --apply để ghi DB.');
  }
  await prisma.$disconnect();
}

main().catch(async err => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
