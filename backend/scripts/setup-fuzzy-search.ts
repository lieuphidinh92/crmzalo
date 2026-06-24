/**
 * One-time DB setup for accent-insensitive + fuzzy product search.
 *
 *   - unaccent  : strip Vietnamese/Latin diacritics ("vitamin" ~ "Vitamín")
 *   - pg_trgm   : trigram similarity() + GIN index for fuzzy/typo-tolerant match
 *   - f_unaccent: IMMUTABLE wrapper (single-arg unaccent is only STABLE, so it
 *                 can't be indexed; the 2-arg form with an explicit dictionary
 *                 is immutable and indexable)
 *   - GIN trigram indexes on f_unaccent(name)/f_unaccent(sku)
 *
 * Idempotent — safe to re-run. Run after `db push`:
 *   npx tsx --env-file=.env scripts/setup-fuzzy-search.ts
 *
 * NOTE (Supabase): extensions there live in the `extensions` schema. If the
 * f_unaccent body can't resolve 'unaccent', change it to
 * 'extensions.unaccent'::regdictionary (see DEPLOY notes).
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL chưa được set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const STATEMENTS = [
  `CREATE EXTENSION IF NOT EXISTS unaccent`,
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
  `CREATE OR REPLACE FUNCTION f_unaccent(text)
     RETURNS text
     LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
     AS $$ SELECT unaccent('unaccent', $1) $$`,
  `CREATE INDEX IF NOT EXISTS idx_products_name_unaccent_trgm
     ON products USING gin (f_unaccent(name) gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS idx_products_sku_unaccent_trgm
     ON products USING gin (f_unaccent(sku) gin_trgm_ops)`,
];

async function main(): Promise<void> {
  for (const sql of STATEMENTS) {
    await prisma.$executeRawUnsafe(sql);
    console.log('✔', sql.split('\n')[0].trim());
  }
  // Smoke test the function so a broken wrapper fails loudly here.
  const r = await prisma.$queryRawUnsafe<{ v: string }[]>(
    `SELECT f_unaccent('Vitamín Cốm Đặc Biệt') AS v`,
  );
  console.log('f_unaccent test →', r[0]?.v);
  console.log('Setup fuzzy search xong.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('Setup thất bại:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
