/**
 * useCompanies.js — Thông tin 2 pháp nhân dùng để xuất Phiếu xuất kho bán hàng
 * và Biên bản bàn giao. Sale chọn công ty ở popup khi xác nhận đơn.
 *
 * LƯU Ý: MST / SĐT / email của INOCARE đang chờ anh Philip cung cấp.
 *        Điền vào đúng 3 trường `taxCode` / `phone` / `email` bên dưới là xong.
 */
// Ngân hàng nhận tiền — cả 2 pháp nhân đều dùng MB Bank (BIN 970422 cho VietQR).
export const COMPANIES = {
  halovn: {
    key: 'halovn',
    short: 'HaloVN',
    name: 'CÔNG TY TNHH HALOVN',
    address: 'Thôn Thiên Lộc, Xã Trung Chính, Tỉnh Bắc Ninh',
    taxCode: '0110086708',
    phone: '0362 431 998 / 0964 435 197',
    email: 'ketoanhalovn@gmail.com',
    bankName: 'MB Bank (NH Quân Đội)',
    bankBin: '970422',
    accountNo: '238668999999',
    accountName: 'CONG TY TNHH HALOVN',
    logo: '/halovn-logo.png',
    theme: 'halovn', // xanh dương
  },
  inocare: {
    key: 'inocare',
    short: 'Inocare',
    name: 'CÔNG TY TNHH THƯƠNG MẠI VÀ XNK INOCARE',
    address: 'Số 58 Nv1 - Tổng cục 5, Yên Xá, Phường Thanh Liệt, Thành phố Hà Nội, Việt Nam',
    taxCode: '0111344856',
    phone: '', // anh Philip chưa gửi SĐT Inocare — để trống
    email: 'inocare.ketoan@gmail.com',
    bankName: 'MB Bank (NH Quân Đội)',
    bankBin: '970422',
    accountNo: '547969999',
    accountName: 'CTY TNHH THUONG MAI VA XNK INOCARE',
    logo: '/inocare-logo.png',
    theme: 'inocare', // xanh mint
  },
};

export const COMPANY_LIST = [COMPANIES.halovn, COMPANIES.inocare];

export function getCompany(key) {
  return COMPANIES[key] || COMPANIES.halovn;
}
