import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';

/** Lỗi lưu hiện ngay trong hộp đổi category: câu chung và, khi BE trả `errors`, từng câu lỗi theo ô (nhãn tiếng Việt BE ghi) */
export interface CategorySaveError {
  message: string;
  items: string[];
}

export function categorySaveError(e: unknown): CategorySaveError {
  const errors = getProblem(e)?.errors;
  const items = errors ? [...new Set(Object.values(errors).filter((m): m is string => typeof m === 'string' && m.trim() !== ''))] : [];
  return items.length
    ? { message: 'Chưa lưu được category. Còn thiếu hoặc chưa hợp lệ:', items }
    : { message: `Chưa lưu được category. ${problemMessage(e)}`, items: [] };
}
