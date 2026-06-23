/**
 * Manual recompute hạng KH cho 1 org hoặc all org. Dùng để:
 *   - Initial seed sau khi db push lần đầu (cron daily chưa chạy).
 *   - Force recompute sau khi sửa dữ liệu order/cost.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/recompute-customer-ranks.ts             # all orgs
 *   npx tsx --env-file=.env scripts/recompute-customer-ranks.ts <orgId>     # 1 org
 */

import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';

import {
  recomputeRanksForOrg,
  recomputeRanksAllOrgs,
} from '../src/modules/contacts/customer-rank-service.js';

const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

async function main() {
  const orgId = process.argv[2];
  if (orgId) {
    console.log(`Recompute ranks for org ${orgId}`);
    const res = await recomputeRanksForOrg(orgId);
    console.log(JSON.stringify(res, null, 2));
  } else {
    console.log('Recompute ranks for all orgs');
    await recomputeRanksAllOrgs();
  }
  await prisma.$disconnect();
}

main().catch(async err => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
