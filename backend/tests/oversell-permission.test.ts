import test from 'node:test';
import assert from 'node:assert/strict';
import { canConfirmOversell as frontendAllows } from '../../sale-app/src/utils/stock-permission.js';

(globalThis as any).prisma = {};
const { hasOversellAccess, loadOversellAccount, canConfirmOversell } = await import('../src/modules/auth/oversell-permission.js');

const expiry='2026-12-01T00:00:00+07:00';
test('backend and frontend agree on the exclusive Vietnam month boundary',()=>{
  for(const now of [Date.parse(expiry)-1,Date.parse(expiry),Date.parse(expiry)+1]) {
    const expected=now<Date.parse(expiry);
    assert.equal(hasOversellAccess({role:'member',oversell_until:expiry},now),expected);
    assert.equal(frontendAllows({role:'member',oversellUntil:expiry},now),expected);
  }
});
test('normal members, invalid dates, absent and inactive accounts cannot oversell',async()=>{
  for(const until of [null,'invalid','']) {
    assert.equal(hasOversellAccess({role:'member',oversell_until:until}),false);
    assert.equal(frontendAllows({role:'member',oversellUntil:until}),false);
  }
  assert.equal(hasOversellAccess(null),false);
  const db={$queryRaw:async()=>[]};
  assert.equal(await canConfirmOversell({id:'inactive',orgId:'org'},db),false);
});
test('owner/admin behavior is preserved',()=>{
  for(const role of ['owner','admin']) {
    assert.equal(hasOversellAccess({role,oversell_until:null}),true);
    assert.equal(frontendAllows({role}),true);
  }
});
test('permission uses current active account scoped to org rather than JWT claims',async()=>{
  let current={role:'member',oversell_until:new Date(Date.now()+60000)};
  const session={id:'duc',orgId:'halo',role:'admin',oversellUntil:expiry};
  const db={$queryRaw:async(strings:TemplateStringsArray,...values:unknown[])=>{
    assert.deepEqual(values,['duc','halo']);
    assert(strings.join('?').includes('is_active=true'));
    return [current];
  }};
  assert.equal(await canConfirmOversell(session,db),true);
  current={role:'member',oversell_until:new Date(0)};
  assert.equal(await canConfirmOversell(session,db),false);
  assert.equal((await loadOversellAccount(session,db))?.role,'member');
});
