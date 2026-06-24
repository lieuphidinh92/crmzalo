/**
 * Accent-insensitive + fuzzy product search.
 *
 * Returns product IDs ranked by relevance (best match first). Matches when:
 *   1. SKU starts with the term                              (exact-ish code)
 *   2. SKU/name contains the term, ignoring diacritics       ("canxi" ⇒ "Canxi")
 *   3. a word in the name is similar to the term (typo-safe) ("vitmin" ⇒ "Vitamin")
 *
 * Relies on the `unaccent` + `pg_trgm` extensions and the IMMUTABLE
 * `f_unaccent()` wrapper created by scripts/setup-fuzzy-search.ts. Word
 * similarity (not whole-string similarity) is used so a short query still
 * scores high against a long product name.
 */
import { prisma } from '../../shared/database/prisma-client.js';

export interface SearchProductIdsOpts {
  orgId: string;
  term: string;
  /** Restrict to status='active' (sale-app catalog). Default false. */
  activeOnly?: boolean;
  /** Max IDs to return. Default 60, hard-capped at 300. */
  limit?: number;
}

// Fuzzy (typo-tolerant) matching only kicks in from 3 chars — below that a
// single trigram matches too much, so we stick to prefix/substring.
const FUZZY_MIN_LEN = 3;
const WORD_SIM_THRESHOLD = 0.5;

// Escape LIKE/ILIKE wildcards so a term like "50%" is matched literally.
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => '\\' + c);
}

export async function searchProductIds(opts: SearchProductIdsOpts): Promise<string[]> {
  const term = opts.term.trim();
  if (!term) return [];

  const limit = Math.min(300, Math.max(1, opts.limit ?? 60));
  const activeOnly = opts.activeOnly ?? false;
  const esc = escapeLike(term);
  const prefix = esc + '%';
  const contains = '%' + esc + '%';
  const useFuzzy = term.length >= FUZZY_MIN_LEN;

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM products
    WHERE org_id = ${opts.orgId}
      AND (${activeOnly}::boolean = false OR status = 'active')
      AND (
        sku ILIKE ${prefix}
        OR f_unaccent(sku) ILIKE f_unaccent(${contains})
        OR f_unaccent(name) ILIKE f_unaccent(${contains})
        OR (${useFuzzy}::boolean AND word_similarity(f_unaccent(${term}), f_unaccent(name)) > ${WORD_SIM_THRESHOLD})
      )
    ORDER BY
      (sku ILIKE ${prefix}) DESC,
      (f_unaccent(name) ILIKE f_unaccent(${contains})) DESC,
      word_similarity(f_unaccent(${term}), f_unaccent(name)) DESC,
      name ASC
    LIMIT ${limit}
  `;
  return rows.map((r: { id: string }) => r.id);
}
