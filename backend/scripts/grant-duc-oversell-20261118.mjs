import pg from 'pg';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const apply=process.argv.includes('--apply');
const id='0243010d-888e-4228-82ca-cbc8f8be49f4',org='7dc86328-624d-4e2d-b0b6-bc62b574a95a';
const until='2026-11-30T17:00:00.000Z'; // exclusive: 01/12/2026 00:00 Vietnam
const c=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
await c.connect();
try {
  await c.query('BEGIN');
  await c.query("SET LOCAL lock_timeout='5s'");
  const column=(await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='oversell_until'")).rows[0];
  const before=(await c.query('SELECT id,org_id,email,full_name,role,is_active,can_view_all_orders,can_issue_vat,can_manage_imports'+(column?',oversell_until':'')+' FROM public.users WHERE id=$1 AND org_id=$2 FOR UPDATE',[id,org])).rows[0];
  assert.equal(before?.email,'lehuynhduc24031998@gmail.com');
  assert.equal(before.full_name,'Lê Huỳnh Đức');assert.equal(before.role,'member');assert.equal(before.is_active,true);
  console.log(JSON.stringify({mode:apply?'APPLY':'PREVIEW',name:before.full_name,role:before.role,oldUntil:before.oversell_until??null,until,addColumn:!column}));
  if(!apply) await c.query('ROLLBACK');
  else {
    const folder=new URL('./backups/',import.meta.url);mkdirSync(folder,{recursive:true});
    writeFileSync(new URL(`duc-oversell-before-${Date.now()}.json`,folder),JSON.stringify(before,null,2),{mode:0o600,flag:'wx'});
    if(!column) await c.query('ALTER TABLE public.users ADD COLUMN oversell_until timestamptz');
    if(!before.oversell_until || new Date(before.oversell_until).toISOString()!==until) {
      await c.query("UPDATE public.users SET oversell_until=$3::timestamptz,updated_at=timezone('UTC',now()) WHERE id=$1 AND org_id=$2",[id,org,until]);
      const actor=(await c.query("SELECT id FROM public.users WHERE org_id=$1 AND role='owner' AND is_active=true ORDER BY id LIMIT 1",[org])).rows[0];
      assert(actor);
      await c.query('INSERT INTO activity_logs(id,org_id,user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',[randomUUID(),org,actor.id,'user.permission.granted','user',id,JSON.stringify({permission:'confirmOversell',oldValue:before.oversell_until??null,newValue:until,timeZone:'Asia/Ho_Chi_Minh',reason:'CEO requested confirmation of orders above stock for Đức until the end of November 2026',roleUnchanged:true})]);
    }
    const after=(await c.query('SELECT id,org_id,email,full_name,role,is_active,can_view_all_orders,can_issue_vat,can_manage_imports,oversell_until FROM public.users WHERE id=$1 AND org_id=$2',[id,org])).rows[0];
    assert.equal(new Date(after.oversell_until).toISOString(),until);
    for(const key of Object.keys(before).filter(k=>k!=='oversell_until')) assert.deepEqual(after[key],before[key]);
    await c.query('COMMIT');
    console.log(JSON.stringify({committed:true,roleUnchanged:true,otherPermissionsUnchanged:true,until:after.oversell_until}));
  }
} catch(e) {await c.query('ROLLBACK');throw e;} finally {await c.end();}
