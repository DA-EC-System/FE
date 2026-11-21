import type { DataScope } from '@/types/catalog';

/** Tiêu đề và mô tả hai tầng dữ liệu (Documents/21 §5.6; chữ theo Documents/29 mục 2) */
export const SCOPE_TEXT: Record<DataScope, { title: string; hint: string }> = {
  platform: {
    title: 'Mặc định của hệ thống',
    hint: 'Soạn sẵn, dùng chung mọi công ty. Không sửa, không xoá được; thêm được phần riêng của công ty.',
  },
  company: {
    title: 'Tự tạo',
    hint: 'Công ty tự thêm, sửa, xoá được.',
  },
};

/** Chia dòng theo tầng; dòng thiếu `scope` tính là chuẩn nền tảng (chỉ đọc): thiếu dữ liệu thì không mở nút sửa */
export function splitByScope<T extends { scope?: DataScope }>(rows: readonly T[]): Record<DataScope, T[]> {
  return {
    platform: rows.filter((r) => r.scope !== 'company'),
    company: rows.filter((r) => r.scope === 'company'),
  };
}
