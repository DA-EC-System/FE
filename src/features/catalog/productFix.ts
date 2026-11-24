import { createContext, useContext } from 'react';

/** Chỗ sửa trong cùng trang sản phẩm, tách từ `BlockerFix.to` */
export interface ProductFixTarget {
  /** `?spec=`: mở hộp Thông tin SKU của biến thể */
  spec?: string;
  /** `?tab=`: tab cần mở; không có là tab Nội bộ */
  tab: string;
  /** `?focus=`: ô cần cuộn tới */
  focus?: string;
}

/**
 * Link sửa trỏ vào đúng trang sản phẩm đang mở thì trả chỗ sửa để trang tự mở hộp hay chuyển tab (qua hộp "Chuyển tab khi
 * chưa lưu?"), không đổi URL bằng `<Link>` (review PR #480). Trỏ chỗ khác thì null.
 */
export function productFixTarget(to: string, productPath: string): ProductFixTarget | null {
  const [path, query = ''] = to.split('?');
  if (path !== productPath) return null;
  const q = new URLSearchParams(query);
  return {
    ...(q.get('spec') ? { spec: q.get('spec')! } : {}),
    tab: q.get('tab') ?? 'commerio',
    ...(q.get('focus') ? { focus: q.get('focus')! } : {}),
  };
}

/** Trang sản phẩm cấp hàm mở chỗ sửa cho các nút sửa bên trong (tab sàn); ngoài trang sản phẩm là null, nút dùng `<Link>` */
export const ProductFixContext = createContext<((to: string) => boolean) | null>(null);
export const useProductFix = () => useContext(ProductFixContext);
