import { prisma } from '../../shared/database/prisma-client.js';

type Account = { role: string; oversell_until: Date | string | null };
type Session = { id: string; orgId: string };

export function hasOversellAccess(account: Account | null, now = Date.now()): boolean {
  if (!account) return false;
  if (account.role === 'owner' || account.role === 'admin') return true;
  const expires = account.oversell_until ? new Date(account.oversell_until).getTime() : NaN;
  return Number.isFinite(expires) && now < expires;
}

// Query the active account on each confirmation; old JWTs cannot extend or restore a grant.
export async function loadOversellAccount(session: Session, client: any = prisma): Promise<Account | null> {
  const rows = await client.$queryRaw`SELECT role, oversell_until FROM public.users
    WHERE id=${session.id} AND org_id=${session.orgId} AND is_active=true`;
  return rows[0] ?? null;
}

export async function canConfirmOversell(session: Session, client: any = prisma): Promise<boolean> {
  return hasOversellAccess(await loadOversellAccount(session, client));
}
