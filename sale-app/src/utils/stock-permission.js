export function canConfirmOversell(user, now = Date.now()) {
  if (!user) return false;
  if (['owner', 'admin'].includes(user.role)) return true;
  const expires = user.oversellUntil ? new Date(user.oversellUntil).getTime() : NaN;
  return Number.isFinite(expires) && now < expires;
}
