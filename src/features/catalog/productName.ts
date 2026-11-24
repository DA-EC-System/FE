/** Tên sản phẩm tối thiểu, tính sau khi bỏ khoảng trắng hai đầu (hotfix: áp cho mọi sản phẩm, tên ngắn sàn khó gợi ý category) */
export const PRODUCT_NAME_MIN = 25;
/** Tối đa đang dùng ở form sản phẩm, cùng BE `name('sản phẩm', 200)` */
export const PRODUCT_NAME_MAX = 200;

/** Số ký tự của tên sau khi trim; đếm theo ký tự hiển thị (NFC) để chữ có dấu gõ kiểu tổ hợp không bị đếm đôi */
export function productNameLength(name: string): number {
  return Array.from(name.trim().normalize('NFC')).length;
}

/** Câu lỗi dưới ô tên khi tên quá ngắn; null là đạt */
export function productNameError(name: string): string | null {
  const n = productNameLength(name);
  return n < PRODUCT_NAME_MIN ? `Tên sản phẩm cần ít nhất ${PRODUCT_NAME_MIN} ký tự (hiện ${n})` : null;
}

/** Chữ bộ đếm cạnh ô tên */
export function productNameCounter(name: string, max = PRODUCT_NAME_MAX): string {
  const n = productNameLength(name);
  return n < PRODUCT_NAME_MIN ? `${n}/${max} · tối thiểu ${PRODUCT_NAME_MIN}` : `${n}/${max}`;
}
