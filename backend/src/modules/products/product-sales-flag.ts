/**
 * Flip Product.hasSales=true the first time a product appears on an order line.
 *
 * Products with hasSales=false are hidden from the default catalog browse to
 * keep it tidy; they stay findable the moment the user searches (by SKU/name).
 *
 * Cheap + idempotent: updateMany only touches rows still false, so re-calling
 * for an already-sold product is a no-op. Pass a transaction client when called
 * inside a `prisma.$transaction` so the flag commits atomically with the order.
 */
import { prisma } from '../../shared/database/prisma-client.js';

export async function markProductsHasSales(
  productIds: Array<string | null | undefined>,
  client: any = prisma,
): Promise<void> {
  const ids = Array.from(
    new Set(productIds.filter((id): id is string => Boolean(id))),
  );
  if (ids.length === 0) return;
  await client.product.updateMany({
    where: { id: { in: ids }, hasSales: false },
    data: { hasSales: true },
  });
}
