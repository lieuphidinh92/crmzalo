import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

test('lấy token rồi đọc thông tin công ty AMIS Kế toán đúng header và body', async (t) => {
  const requests: Array<{ url: string; headers: Record<string, string | string[] | undefined>; body: any }> = [];
  let rejectToken = false;
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      const parsedBody = raw ? JSON.parse(raw) : {};
      requests.push({
        url: req.url || '',
        headers: req.headers,
        body: parsedBody,
      });
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/amiskt/v1/token') {
        if (rejectToken) {
          res.end(JSON.stringify({
            Success: false,
            ErrorCode: 'InvalidParam',
            ErrorMessage: 'access_code = <access-test> không hợp lệ',
          }));
          return;
        }
        res.end(JSON.stringify({
          Success: true,
          Data: { access_token: 'token-test', expired_time: '2099-01-01T00:00:00' },
        }));
        return;
      }
      if (req.url === '/amiskt/v1/get_dictionary') {
        const data = parsedBody.skip === 0
          ? [{ account_object_code: 'KH001' }, { account_object_code: 'KH002' }]
          : [{ account_object_code: 'KH003' }];
        res.end(JSON.stringify({ Success: true, Data: data }));
        return;
      }
      if (req.url === '/amiskt/v1/save_dictionary') {
        res.end(JSON.stringify({ Success: true, Data: 'queued' }));
        return;
      }
      if (req.url === '/amiskt/v1/save') {
        res.end(JSON.stringify({ Success: true, Data: 'voucher-queued' }));
        return;
      }
      res.end(JSON.stringify({
        Success: 'true',
        Data: JSON.stringify({ company_name: 'INOCARE', tax_code: '0111344856' }),
      }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  assert(address && typeof address === 'object');

  process.env.AMISKT_BASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.AMISKT_CLIENT_ID = 'client-test';
  process.env.AMISKT_ACCESS_CODE = 'access-test';
  process.env.AMISKT_ORG_COMPANY_CODE = 'halovn-test';

  const client = await import('./amis-accounting-client.js');
  client.clearAmisAccountingTokenForTest();
  assert.deepEqual(client.amisAccountingConfigState(), { configured: true, missing: [] });
  const company = await client.getAmisAccountingCompanyInfo();

  assert.deepEqual(company, { company_name: 'INOCARE', tax_code: '0111344856' });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].headers.clientid, 'client-test');
  assert.deepEqual(requests[0].body, {
    access_code: 'access-test',
    org_company_code: 'halovn-test',
  });
  assert.equal(requests[1].headers.clientid, 'client-test');
  assert.equal(requests[1].headers['x-misa-accesstoken'], 'token-test');
  assert.deepEqual(requests[1].body, { branch_id: null });

  const customers = await client.getAllAmisAccountingDictionary(1, 2);
  assert.deepEqual(customers, [
    { account_object_code: 'KH001' },
    { account_object_code: 'KH002' },
    { account_object_code: 'KH003' },
  ]);
  assert.equal(requests[2].headers['x-misa-accesstoken'], 'token-test');
  assert.deepEqual(requests[2].body, {
    data_type: 1,
    skip: 0,
    take: 2,
    last_sync_time: null,
  });
  assert.equal(requests[3].body.skip, 2);

  const queued = await client.saveAmisAccountingDictionary([{
    dictionary_type: 1,
    account_object_code: 'KH004',
  }]);
  assert.equal(queued, 'queued');
  assert.deepEqual(requests[4].body, {
    org_company_code: 'halovn-test',
    dictionary: [{ dictionary_type: 1, account_object_code: 'KH004' }],
  });

  const voucherQueued = await client.saveAmisAccountingVouchers([{
    voucher_type: 11,
    org_refid: 'ref-1',
  }]);
  assert.equal(voucherQueued, 'voucher-queued');
  assert.deepEqual(requests[5].body, {
    org_company_code: 'halovn-test',
    voucher: [{ voucher_type: 11, org_refid: 'ref-1' }],
    dictionary: [],
  });

  rejectToken = true;
  client.clearAmisAccountingTokenForTest();
  await assert.rejects(
    () => client.getAmisAccountingToken(),
    (err: Error) => {
      assert(!err.message.includes('access-test'));
      assert.match(err.message, /\[đã ẩn\]/);
      return true;
    },
  );
});
