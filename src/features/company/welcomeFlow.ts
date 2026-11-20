/**
 * Dấu "đang làm theo hướng dẫn thiết lập" (FE#419): wizard `/welcome` đặt dấu trước khi mở trang có sẵn (thiết lập
 * gian hàng, phiếu kiểm kê, uỷ quyền sàn), các trang đó đọc dấu để hiện thanh quay lại và tự về wizard khi xong.
 * Giữ trong sessionStorage theo công ty: đóng tab là hết, không lưu cờ nào ở BE (Documents/21 mục 23).
 */

const key = (companyId: string) => `commerio_welcome:${companyId}`;

export function markWelcome(companyId: string) {
  try {
    sessionStorage.setItem(key(companyId), '1');
  } catch {
    // Trình duyệt chặn bộ nhớ: chỉ mất thanh quay lại, wizard vẫn dùng được
  }
}

export function clearWelcome(companyId: string) {
  try {
    sessionStorage.removeItem(key(companyId));
  } catch {
    // bỏ qua
  }
}

export function fromWelcome(companyId: string): boolean {
  try {
    return Boolean(companyId) && sessionStorage.getItem(key(companyId)) === '1';
  } catch {
    return false;
  }
}
