import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';
const url = process.env.DATABASE_URL!;
if (url.includes('localhost')) throw new Error('Refuse to run on localhost (this script is PROD only)');
console.log('Connecting to host:', url.replace(/:[^@]*@/, ':<creds>@').match(/@([^/]+)/)?.[1]);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
(async () => {
  const contactCount = await prisma.contact.count();
  const orderCount = await prisma.order.count();
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  console.log(`Connected ✓`);
  console.log(`  Orgs: ${orgs.length} ${orgs.map(o => o.name).join(', ')}`);
  console.log(`  Contacts: ${contactCount}`);
  console.log(`  Orders: ${orderCount}`);
  // Check schema state — có cột customer_code chưa?
  const cols = await prisma.$queryRawUnsafe<any[]>(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'contacts'
      AND column_name IN ('customer_code', 'customer_rank', 'birthday', 'rank_score')
    ORDER BY column_name
  `);
  console.log(`  PR1/PR2 columns hiện có: ${cols.map(c => c.column_name).join(', ') || '(chưa có gì)'}`);
  await prisma.$disconnect();
})().catch(async e => { console.error('FAIL:', e.message); await prisma.$disconnect(); process.exit(1); });
