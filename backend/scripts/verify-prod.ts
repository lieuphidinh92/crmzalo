/**
 * PROD verify — sau migration full, check tình trạng DB.
 * Show top KH sort revenueLifetime DESC + sort rank DESC để confirm.
 */
import prismaPkg from '@prisma/client';
const { PrismaClient, Prisma } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';

const conn = process.env.DATABASE_URL!;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

(async () => {
  const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
  console.log(`Org: ${org!.name} (${org!.id})\n`);

  const stats = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      (SELECT COUNT(*)::int FROM contacts WHERE org_id = '${org!.id}') AS contacts,
      (SELECT COUNT(*)::int FROM contacts WHERE customer_code IS NOT NULL AND org_id = '${org!.id}') AS with_code,
      (SELECT COUNT(*)::int FROM contacts WHERE customer_rank IS NOT NULL AND org_id = '${org!.id}') AS with_rank,
      (SELECT COUNT(*)::int FROM contacts WHERE phone IS NOT NULL AND org_id = '${org!.id}') AS with_phone,
      (SELECT COUNT(*)::int FROM contact_care_logs) AS care_logs,
      (SELECT COUNT(*)::int FROM orders WHERE org_id = '${org!.id}') AS orders
  `);
  console.log('=== DB state ===');
  console.log(stats[0]);

  console.log('\n=== Top 5 sort revenueLifetime DESC ===');
  const top5Rev = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT c.customer_code, c.full_name, c.customer_rank, c.rank_score,
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.status IN ('confirmed','shipped','completed')), 0)::float AS rev
    FROM contacts c
    LEFT JOIN orders o ON o.contact_id = c.id
    WHERE c.org_id = ${org!.id}
    GROUP BY c.id
    ORDER BY rev DESC NULLS LAST
    LIMIT 5
  `);
  top5Rev.forEach(r => console.log(`  ${r.customer_code} | ${(r.full_name ?? '').slice(0,32)} | rank=${r.customer_rank} score=${r.rank_score} | DS=${(r.rev/1e6).toFixed(1)}tr`));

  console.log('\n=== Top 5 sort rankScore DESC ===');
  const top5Rank = await prisma.contact.findMany({
    where: { orgId: org!.id, customerRank: { not: null } },
    select: { customerCode: true, fullName: true, customerRank: true, rankScore: true },
    orderBy: { rankScore: 'desc' },
    take: 5,
  });
  top5Rank.forEach(c => console.log(`  ${c.customerCode} | ${(c.fullName ?? '').slice(0,32)} | ${c.customerRank} (${c.rankScore})`));

  console.log('\n=== Schema check ===');
  const constraints = await prisma.$queryRawUnsafe<any[]>(`
    SELECT constraint_name FROM information_schema.table_constraints
    WHERE table_name = 'contacts' AND constraint_type = 'UNIQUE'
  `);
  console.log('Unique constraints on contacts:', constraints.map(c => c.constraint_name));

  await prisma.$disconnect();
})().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
