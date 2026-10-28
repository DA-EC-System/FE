import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import '@/lib/zod';
import { codeMessage } from '@/api/problemMessages';
import { formatCurrency, formatDate, formatDateTime } from './format';

// Intl chèn khoảng trắng không ngắt trước ký hiệu tiền
const plain = (s: string) => s.replace(/\s/g, ' ');

describe('định dạng', () => {
  it('ngày và giờ theo kiểu Việt Nam', () => {
    expect(formatDate('2026-10-28T08:05:00')).toBe('28/10/2026');
    expect(formatDateTime('2026-10-28T08:05:00')).toBe('28/10/2026 08:05');
  });

  it('thiếu hoặc sai ngày thì hiện gạch ngang', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('không phải ngày')).toBe('—');
  });

  it('tiền VND không có số lẻ', () => {
    expect(plain(formatCurrency(1234567))).toBe('1.234.567 ₫');
    expect(plain(formatCurrency(1999.6))).toBe('2.000 ₫');
  });
});

describe('bảng nhãn', () => {
  it('mã lỗi đã biết có câu tiếng Việt, mã lạ giữ nguyên', () => {
    expect(codeMessage('second_person_required')).toMatch(/người thứ hai/);
    expect(codeMessage('ma_chua_co')).toBe('ma_chua_co');
  });

  it('zod báo lỗi mặc định bằng tiếng Việt', () => {
    const r = z.object({ ten: z.string() }).safeParse({});
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).not.toMatch(/expected|Invalid/i);
  });
});
