/**
 * PROD BACKUP — tạo snapshot 5 bảng quan trọng trước migration PR1-PR4.
 *
 * Idempotent: nếu bảng backup đã tồn tại → DROP rồi tạo lại (an toàn vì
 * chỉ tạo lúc trước migration, không có data sản xuất ở đó).
 *
 * Restore (sau migration nếu lỗi):
 *   TRUNCATE contacts CASCADE;
 *   INSERT INTO contacts SELECT * FROM contacts_backup_prepr1;
 *   (tương tự các bảng khác)
 *
 * Usage:
 *   npx tsx --env-file=.env.prod.local scripts/prod-backup-tables.ts
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';

const url = process.env.DATABASE_URL!;
if (!url) throw new Error('DATABASE_URL not set');
if (url.includes('localhost')) {
  throw new Error('Refuse to run on localhost — this is the PROD backup script.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const TABLES = [
  'contacts',
  'orders',
  'order_items',
  'tasks',
  'stage_history',
];

async function main() {
  console.log(`Backing up ${TABLES.length} tables...\n`);
  for (const t of TABLES) {
    const backupName = `${t}_backup_prepr1`;
    // Drop nếu đã tồn tại (idempotent re-run safety)
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${backupName}`);
    await prisma.$executeRawUnsafe(
      `CREATE TABLE ${backupName} AS SELECT * FROM ${t}`,
    );
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM ${backupName}`,
    );
    console.log(`  ✓ ${backupName}: ${rows[0].count} rows`);
  }
  console.log('\n=== BACKUP TỔNG KẾT ===');
  for (const t of TABLES) {
    const orig = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM ${t}`,
    );
    const bak = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM ${t}_backup_prepr1`,
    );
    const match = orig[0].count === bak[0].count ? '✓' : '✗';
    console.log(`  ${match} ${t}: original=${orig[0].count}  backup=${bak[0].count}`);
  }
  console.log('\nXong. Anh confirm count khớp xong em sang db push.');
  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('FAIL:', e);
  await prisma.$disconnect();
  process.exit(1);
});
