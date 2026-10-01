/** Local-only HTTP upload tests. Never send images or credentials to external services. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import { config } from '../src/config/index.js';
import { prisma } from '../src/shared/database/prisma-client.js';
import { receiptAssistantRoutes } from '../src/modules/receipt-assistant/routes.js';
if (!['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname)) throw Error('LOCAL ONLY');
const app = Fastify();
await app.register(jwt, { secret: randomUUID() });
await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
await app.register(receiptAssistantRoutes);
const org = await prisma.organization.create({ data: { name: 'Receipt Upload QA ' + randomUUID() } });
const originalFetch = globalThis.fetch;
const originalStorage = { supabaseUrl: config.supabaseUrl, supabaseServiceKey: config.supabaseServiceKey, supabaseStorageBucket: config.supabaseStorageBucket };
config.supabaseUrl = 'https://receipt-upload-qa.invalid';
config.supabaseServiceKey = 'qa-only-dummy-key';
config.supabaseStorageBucket = 'qa-proofs';
let uploadCount = 0;
globalThis.fetch = async (url: any, init: any) => {
  assert(String(url).startsWith('https://receipt-upload-qa.invalid/storage/v1/object/qa-proofs/proofs/' + org.id + '/'), 'Unexpected outbound destination blocked');
  assert.equal(init?.method, 'POST');
  assert.equal(init?.headers?.['Content-Type'], 'image/png');
  assert(Buffer.isBuffer(init?.body));
  uploadCount++;
  return new Response('{}', { status: 200 });
};
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const secondPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVQIHWP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
try {
  const user = await prisma.user.create({ data: { orgId: org.id, email: randomUUID() + '@qa.invalid', fullName: 'Upload QA', passwordHash: 'none', role: 'admin' } });
  const token = app.jwt.sign({ id: user.id, orgId: org.id, email: user.email, role: user.role });
  async function upload(files: Buffer[]) {
    const boundary = 'qa-' + randomUUID();
    const parts: Buffer[] = [];
    files.forEach((body, i) => parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="bill-${i}.png"\r\nContent-Type: image/png\r\n\r\n`), body, Buffer.from('\r\n')));
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    const response = await app.inject({ method: 'POST', url: '/api/v1/receipt-assistant/analyze', headers: { authorization: 'Bearer ' + token, 'content-type': 'multipart/form-data; boundary=' + boundary }, payload: Buffer.concat(parts) });
    return { status: response.statusCode, body: response.json() };
  }
  const two = await upload([png, secondPng]);
  assert.equal(two.status, 200, JSON.stringify(two));
  assert.equal(two.body.bills.length, 2);
  assert.equal(uploadCount, 2);
  for (const bill of two.body.bills) {
    assert.equal(bill.fields.amount, null);
    assert(bill.warnings.some((w: string) => w.includes('Chưa cấu hình AI đọc bill')));
    assert(!('hash' in bill), 'Internal image hash not returned');
  }
  assert.equal((await upload([Buffer.from('This is not an image')])).status, 400);
  assert.equal((await upload([png, png])).status, 400);
  assert.equal(uploadCount, 2, 'Invalid input causes no uploads');
  // Size boundary: route may override global 5 MB but must enforce its own 8 MB.
  const aboveFive = Buffer.concat([png, Buffer.alloc(6 * 1024 * 1024)]);
  assert.equal((await upload([aboveFive])).status, 200);
  assert.equal((await upload([Buffer.concat([png, Buffer.alloc(8 * 1024 * 1024)])])).status, 413);
  const beforeTooMany = uploadCount;
  const tooMany = await upload(Array.from({ length: 6 }, (_, i) => Buffer.concat([png, Buffer.from(String(i))])));
  assert.equal(tooMany.status, 413);
  assert.equal(uploadCount, beforeTooMany);
  console.log('PASS: two PNGs override global one-file limit; 6 MB overrides global 5 MB; 8 MB/5-files caps enforced; nonimage/duplicate blocked pre-upload; missing AI returns safe manual fallback; all storage mocked locally');
} finally {
  globalThis.fetch = originalFetch;
  Object.assign(config, originalStorage);
  await prisma.receiptAssistantDraft.deleteMany({ where: { orgId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
  await app.close();
  await prisma.$disconnect();
}
