/**
 * Quy tắc SKU của danh mục (QT-11, D14). Chữ cố định cộng hai loại token:
 *  - {SEQ} hoặc {SEQ:n}: số thứ tự của danh mục, đệm 0 cho đủ n chữ số (mặc định 4)
 *  - {VAL}: mã các giá trị thuộc tính của biến thể, nối bằng "-"
 * Vd "AO-{SEQ:4}-{VAL}" → "AO-0012-DEN-XL".
 * FE dùng để xem trước; SKU thật do BE sinh và giữ duy nhất trong công ty.
 * Mock dùng chung hàm này; BE cần sinh cùng kết quả (commerio-backend#13).
 */

const TOKEN = /\{(SEQ(?::(\d))?|VAL)\}/g;
const LITERAL = /^[A-Z0-9_-]*$/;

/** "Xanh navy" → "XANHNA", "Đỏ" → "DO" */
export function valueCode(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

/** Lỗi của quy tắc (tiếng Việt) hoặc null nếu hợp lệ */
export function skuPatternError(pattern: string): string | null {
  const p = pattern.trim();
  if (!p) return 'Nhập quy tắc SKU';
  if (p.length > 40) return 'Quy tắc tối đa 40 ký tự';
  const seq = p.match(/\{SEQ(?::\d)?\}/g) ?? [];
  if (seq.length !== 1) return 'Quy tắc phải có đúng một {SEQ} để SKU không trùng';
  if ((p.match(/\{VAL\}/g) ?? []).length > 1) return 'Chỉ dùng {VAL} một lần';
  const literal = p.replace(TOKEN, '');
  if (/\{|\}/.test(literal)) return 'Chỉ dùng {SEQ}, {SEQ:n} (n từ 1 đến 9) và {VAL}';
  if (!LITERAL.test(literal)) return 'Phần chữ cố định chỉ gồm A-Z, 0-9, "-" và "_"';
  if (/\{SEQ:0\}/.test(p)) return 'Số chữ số của {SEQ} từ 1 đến 9';
  return null;
}

export function renderSku(pattern: string, seq: number, values: string[]): string {
  const val = values.map(valueCode).filter(Boolean).join('-');
  return pattern
    .trim()
    .replace(TOKEN, (_, token: string, width?: string) =>
      token === 'VAL' ? val : String(seq).padStart(Number(width ?? 4), '0'),
    )
    // Biến thể không có thuộc tính: bỏ dấu nối thừa quanh {VAL}
    .replace(/([-_]){2,}/g, '$1')
    .replace(/^[-_]+|[-_]+$/g, '');
}
