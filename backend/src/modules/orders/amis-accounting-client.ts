import { config } from '../../config/index.js';

const TOKEN_FALLBACK_TTL_MS = 11 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

let cachedToken = '';
let cachedTokenExpiresAt = 0;

type AmisEnvelope = {
  Success?: boolean | string;
  success?: boolean | string;
  ErrorCode?: string;
  errorCode?: string;
  ErrorMessage?: string;
  errorMessage?: string;
  Data?: unknown;
  data?: unknown;
};

export type AmisAccountingConfigState = {
  configured: boolean;
  missing: string[];
};

export type AmisAccountingDictionaryType = 1 | 2 | 4 | 6;

function successValue(body: AmisEnvelope): boolean {
  const value = body.Success ?? body.success;
  return value === true || String(value).toLowerCase() === 'true';
}

function errorMessage(body: AmisEnvelope, fallback: string): string {
  const raw = body.ErrorMessage
    || body.errorMessage
    || body.ErrorCode
    || body.errorCode
    || fallback;
  const secrets = [
    config.amisAccountingAccessCode,
    config.amisAccountingClientId,
  ].filter(Boolean);
  return secrets.reduce(
    (message, secret) => message.split(secret).join('[đã ẩn]'),
    raw,
  ).replace(/access_code\s*=\s*<[^>]+>/gi, 'access_code = [đã ẩn]');
}

function responseData(body: AmisEnvelope): unknown {
  const value = body.Data ?? body.data;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function parseResponse(response: Response): Promise<AmisEnvelope> {
  const text = await response.text();
  let body: AmisEnvelope = {};
  try {
    body = text ? JSON.parse(text) as AmisEnvelope : {};
  } catch {
    throw Object.assign(new Error('AMIS Kế toán trả dữ liệu không hợp lệ.'), {
      statusCode: 502,
      code: 'AMISKT_INVALID_RESPONSE',
    });
  }

  if (!response.ok) {
    throw Object.assign(new Error(errorMessage(body, `AMIS Kế toán trả HTTP ${response.status}.`)), {
      statusCode: 502,
      code: body.ErrorCode || body.errorCode || 'AMISKT_HTTP_ERROR',
    });
  }
  return body;
}

async function post(path: string, headers: Record<string, string>, payload: unknown): Promise<AmisEnvelope> {
  let response: Response;
  try {
    response = await fetch(`${config.amisAccountingBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err: any) {
    const timeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw Object.assign(
      new Error(timeout ? 'AMIS Kế toán phản hồi quá chậm.' : 'Không kết nối được AMIS Kế toán.'),
      { statusCode: 502, code: timeout ? 'AMISKT_TIMEOUT' : 'AMISKT_NETWORK_ERROR', cause: err },
    );
  }
  return parseResponse(response);
}

export function amisAccountingConfigState(): AmisAccountingConfigState {
  const required: Array<[string, string]> = [
    ['AMISKT_CLIENT_ID', config.amisAccountingClientId],
    ['AMISKT_ACCESS_CODE', config.amisAccountingAccessCode],
    ['AMISKT_ORG_COMPANY_CODE', config.amisAccountingOrgCompanyCode],
  ];
  const missing = required.filter(([, value]) => !value.trim()).map(([name]) => name);
  return { configured: missing.length === 0, missing };
}

function assertConfigured(): void {
  const state = amisAccountingConfigState();
  if (state.configured) return;
  throw Object.assign(new Error(`AMIS Kế toán chưa được cấu hình đủ: ${state.missing.join(', ')}`), {
    statusCode: 503,
    code: 'AMISKT_NOT_CONFIGURED',
  });
}

export async function getAmisAccountingToken(): Promise<string> {
  assertConfigured();
  if (cachedToken && Date.now() < cachedTokenExpiresAt - 60_000) return cachedToken;

  const body = await post('/amiskt/v1/token', {
    ClientID: config.amisAccountingClientId,
  }, {
    access_code: config.amisAccountingAccessCode,
    org_company_code: config.amisAccountingOrgCompanyCode,
  });
  if (!successValue(body)) {
    throw Object.assign(new Error(errorMessage(body, 'AMIS Kế toán từ chối cấp mã truy cập.')), {
      statusCode: 502,
      code: body.ErrorCode || body.errorCode || 'AMISKT_TOKEN_ERROR',
    });
  }

  const data = responseData(body) as { access_token?: string; expired_time?: string } | undefined;
  const token = data?.access_token?.trim();
  if (!token) {
    throw Object.assign(new Error('AMIS Kế toán không trả mã truy cập.'), {
      statusCode: 502,
      code: 'AMISKT_EMPTY_TOKEN',
    });
  }

  const parsedExpiry = data?.expired_time ? Date.parse(data.expired_time) : NaN;
  cachedToken = token;
  cachedTokenExpiresAt = Number.isFinite(parsedExpiry)
    ? parsedExpiry
    : Date.now() + TOKEN_FALLBACK_TTL_MS;
  return token;
}

export async function getAmisAccountingCompanyInfo(branchId?: string | null): Promise<unknown> {
  const token = await getAmisAccountingToken();
  const body = await post('/amiskt/v1/get_company_info', {
    ClientID: config.amisAccountingClientId,
    'X-MISA-AccessToken': token,
  }, {
    branch_id: branchId?.trim() || null,
  });
  if (!successValue(body)) {
    throw Object.assign(new Error(errorMessage(body, 'Không lấy được thông tin công ty từ AMIS Kế toán.')), {
      statusCode: 502,
      code: body.ErrorCode || body.errorCode || 'AMISKT_COMPANY_ERROR',
    });
  }
  return responseData(body);
}

export async function getAmisAccountingDictionaryPage(
  dataType: AmisAccountingDictionaryType,
  skip = 0,
  take = 1000,
): Promise<unknown[]> {
  if (!Number.isInteger(skip) || skip < 0 || !Number.isInteger(take) || take < 1 || take > 1000) {
    throw Object.assign(new Error('Tham số phân trang danh mục AMIS không hợp lệ.'), {
      statusCode: 400,
      code: 'AMISKT_INVALID_PAGINATION',
    });
  }

  const token = await getAmisAccountingToken();
  const body = await post('/amiskt/v1/get_dictionary', {
    ClientID: config.amisAccountingClientId,
    'X-MISA-AccessToken': token,
  }, {
    data_type: dataType,
    skip,
    take,
    last_sync_time: null,
  });
  if (!successValue(body)) {
    throw Object.assign(new Error(errorMessage(body, 'Không lấy được danh mục từ AMIS Kế toán.')), {
      statusCode: 502,
      code: body.ErrorCode || body.errorCode || 'AMISKT_DICTIONARY_ERROR',
    });
  }

  const data = responseData(body);
  if (!Array.isArray(data)) {
    throw Object.assign(new Error('AMIS Kế toán trả về danh mục không đúng định dạng.'), {
      statusCode: 502,
      code: 'AMISKT_INVALID_DICTIONARY_RESPONSE',
    });
  }
  return data;
}

export async function getAllAmisAccountingDictionary(
  dataType: AmisAccountingDictionaryType,
  take = 1000,
): Promise<unknown[]> {
  const rows: unknown[] = [];
  const maxRows = 100_000;
  while (rows.length < maxRows) {
    const page = await getAmisAccountingDictionaryPage(dataType, rows.length, take);
    rows.push(...page);
    if (page.length < take) return rows;
  }
  throw Object.assign(new Error('Danh mục AMIS vượt quá giới hạn an toàn 100.000 bản ghi.'), {
    statusCode: 502,
    code: 'AMISKT_DICTIONARY_LIMIT_EXCEEDED',
  });
}

export async function saveAmisAccountingDictionary(
  dictionary: Array<Record<string, unknown>>,
): Promise<unknown> {
  if (!dictionary.length) {
    throw Object.assign(new Error('Danh sách danh mục AMIS cần tạo đang rỗng.'), {
      statusCode: 400,
      code: 'AMISKT_EMPTY_DICTIONARY',
    });
  }
  const token = await getAmisAccountingToken();
  const body = await post('/amiskt/v1/save_dictionary', {
    ClientID: config.amisAccountingClientId,
    'X-MISA-AccessToken': token,
  }, {
    org_company_code: config.amisAccountingOrgCompanyCode,
    dictionary,
  });
  if (!successValue(body)) {
    throw Object.assign(new Error(errorMessage(body, 'AMIS Kế toán từ chối tạo danh mục.')), {
      statusCode: 502,
      code: body.ErrorCode || body.errorCode || 'AMISKT_SAVE_DICTIONARY_ERROR',
    });
  }
  return responseData(body);
}

export async function saveAmisAccountingVouchers(
  voucher: Array<Record<string, unknown>>,
): Promise<unknown> {
  if (!voucher.length) {
    throw Object.assign(new Error('Danh sách chứng từ AMIS cần gửi đang rỗng.'), {
      statusCode: 400,
      code: 'AMISKT_EMPTY_VOUCHER',
    });
  }
  const token = await getAmisAccountingToken();
  const body = await post('/amiskt/v1/save', {
    ClientID: config.amisAccountingClientId,
    'X-MISA-AccessToken': token,
  }, {
    org_company_code: config.amisAccountingOrgCompanyCode,
    voucher,
    dictionary: [],
  });
  if (!successValue(body)) {
    throw Object.assign(new Error(errorMessage(body, 'AMIS Kế toán từ chối nhận chứng từ bán hàng.')), {
      statusCode: 502,
      code: body.ErrorCode || body.errorCode || 'AMISKT_SAVE_VOUCHER_ERROR',
    });
  }
  return responseData(body);
}

export function clearAmisAccountingTokenForTest(): void {
  cachedToken = '';
  cachedTokenExpiresAt = 0;
}
