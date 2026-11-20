import { formatMoneyInput, parseMoney } from '@/utils/price';

/** Kết quả một lần sửa ô tiền: chữ hiển thị và vị trí con trỏ */
export interface MoneyEdit {
  text: string;
  caret: number;
}

/** Chữ đang ở dạng chuẩn do ô tự định dạng ("" hoặc "1.500.000") */
const isCanonical = (text: string) => text === '' || (/^[\d.]+$/.test(text) && formatDigits(text.replace(/\./g, '')) === text);

/** Nhóm 3 chữ số ngay trên chuỗi, không qua Number: số quá dài không bị làm tròn lặng lẽ (parseMoney chặn khi lưu) */
const formatDigits = (digits: string) => digits.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Vị trí ngay sau chữ số thứ `count` trong `text` (đếm từ trái) */
const caretAfterDigits = (text: string, count: number) => {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (/\d/.test(text[i]!)) seen++;
    if (seen === count) return i + 1;
  }
  return text.length;
};

const countDigits = (text: string) => (text.match(/\d/g) ?? []).length;

/**
 * Tính chữ hiển thị sau khi người dùng sửa ô tiền (FE#385).
 * - Chữ cũ đang chuẩn, lần sửa chỉ chèn chữ số hoặc chỉ xoá: định dạng lại phân cách nghìn, con trỏ đứng sau đúng số
 *   chữ số đã đứng trước nó. Xoá trúng dấu chấm thì xoá luôn chữ số cạnh nó (Backspace: bên trái, Delete: bên phải).
 * - Còn lại (dán, gõ dấu): đọc được bằng `parseMoney` thì định dạng lại; không đọc được thì giữ nguyên chữ người dùng
 *   gõ để báo lỗi khi lưu, không đoán.
 */
export function editMoneyInput(prev: string, next: string, caret: number, inputType?: string): MoneyEdit {
  // Phần chung đầu và cuối để biết đoạn bị xoá và đoạn được chèn
  let start = 0;
  while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
  let endPrev = prev.length;
  let endNext = next.length;
  while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
    endPrev--;
    endNext--;
  }
  const removed = prev.slice(start, endPrev);
  const inserted = next.slice(start, endNext);

  if (isCanonical(prev) && /^\d*$/.test(inserted)) {
    let digits = next.replace(/\./g, '');
    let digitsBefore = countDigits(next.slice(0, caret));
    // Chỉ xoá dấu chấm: chữ số không đổi, nên xoá thêm chữ số cạnh dấu để lần bấm có tác dụng
    if (inserted === '' && removed !== '' && /^\.+$/.test(removed)) {
      const forward = inputType === 'deleteContentForward';
      const at = countDigits(prev.slice(0, start)) - (forward ? 0 : 1);
      if (at >= 0 && at < digits.length) {
        digits = digits.slice(0, at) + digits.slice(at + 1);
        digitsBefore = at;
      }
    }
    const text = formatDigits(digits);
    // Số 0 đầu bị bỏ thì con trỏ lùi theo
    const dropped = digits.length - countDigits(text);
    return { text, caret: caretAfterDigits(text, Math.max(0, digitsBefore - dropped)) };
  }

  const parsed = parseMoney(next);
  if (parsed.ok && parsed.value !== null && !/[^\d.,\s]/.test(next.replace(/(đ|₫)\s*$/i, ''))) {
    const text = formatMoneyInput(parsed.value);
    return { text, caret: caretAfterDigits(text, countDigits(next.slice(0, caret))) };
  }
  return { text: next, caret };
}
