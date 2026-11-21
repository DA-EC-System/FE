import type { DataScope } from '@/types/catalog';

/** Tiêu đề và mô tả hai tầng dữ liệu (dữ liệu chung, Documents/21 §5.6) */
export const SCOPE_TEXT: Record<DataScope, { title: string; hint: string }> = {
  platform: {
    title: 'Chuẩn nền tảng',
    hint: 'Dùng chung mọi công ty, nền tảng cập nhật. Công ty không sửa, không xoá; thêm được phần riêng.',
  },
  company: {
    title: 'Của công ty',
    hint: 'Công ty tự tạo, sửa, xoá.',
  },
};

/** Chia dòng theo tầng; dòng thiếu `scope` tính là chuẩn nền tảng (chỉ đọc): thiếu dữ liệu thì không mở nút sửa */
export function splitByScope<T extends { scope?: DataScope }>(rows: readonly T[]): Record<DataScope, T[]> {
  return {
    platform: rows.filter((r) => r.scope !== 'company'),
    company: rows.filter((r) => r.scope === 'company'),
  };
}
