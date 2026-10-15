// Month boundaries are always midnight in Vietnam, independent of server TZ.
export function dashboardMonthRange(month?: string, now = new Date()) {
  const vietnamNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const key = month ?? `${vietnamNow.getUTCFullYear()}-${String(vietnamNow.getUTCMonth() + 1).padStart(2, '0')}`;
  if (!/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(key)) {
    throw Object.assign(new Error('Tháng phải có định dạng YYYY-MM, từ năm 2000 đến 2100'), { statusCode: 400 });
  }
  const [year, monthNumber] = key.split('-').map(Number);
  return {
    month: key,
    start: new Date(Date.UTC(year, monthNumber - 1, 1, -7)),
    end: new Date(Date.UTC(year, monthNumber, 1, -7)),
  };
}
