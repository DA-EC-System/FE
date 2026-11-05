import { useEffect } from 'react';
import { create } from 'zustand';

/**
 * Mắt cuối của breadcrumb trên Header (FE#130). Header tự dựng `Nhóm / Trang` từ navigation.ts;
 * trang chi tiết gọi `useBreadcrumb(mã chứng từ)` để thêm mắt cuối, ví dụ `Đơn hàng / SO-000123`.
 */
interface BreadcrumbStore {
  detail: string | null;
  setDetail: (detail: string | null) => void;
}

export const useBreadcrumbStore = create<BreadcrumbStore>((set) => ({
  detail: null,
  setDetail: (detail) => set({ detail }),
}));

/** Đặt mắt cuối của breadcrumb khi trang còn mở; truyền undefined khi dữ liệu chưa tải xong */
export function useBreadcrumb(detail: string | null | undefined) {
  const setDetail = useBreadcrumbStore((s) => s.setDetail);
  useEffect(() => {
    if (!detail) return;
    setDetail(detail);
    return () => setDetail(null);
  }, [detail, setDetail]);
}
