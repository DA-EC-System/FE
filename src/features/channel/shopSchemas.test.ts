import { describe, expect, it } from 'vitest';
import { authorizationDeadline, platformLabel } from './shopSchemas';
import { shopMachine } from '@/lib/machines/channel';

describe('Hợp đồng sàn mở rộng', () => {
  it('ưu tiên tên BE, rồi nhãn gợi ý, cuối cùng mã sàn', () => {
    expect(platformLabel('shopee', 'Tên từ BE')).toBe('Tên từ BE');
    expect(platformLabel('shopee')).toBe('Shopee');
    expect(platformLabel('shopee_v2')).toBe('shopee_v2');
  });
  it('hiển thị hạn gần hơn, hỗ trợ hạn null', () => {
    expect(authorizationDeadline({ authExpiresAt: '2026-11-01', refreshExpiresAt: '2026-12-01' })).toBe('2026-11-01');
    expect(authorizationDeadline({ authExpiresAt: '2026-12-01', refreshExpiresAt: '2026-11-01' })).toBe('2026-11-01');
    expect(authorizationDeadline({ authExpiresAt: null, refreshExpiresAt: null })).toBeNull();
  });
  it('mất quyền khi đang thiết lập là chuyển trạng thái hệ thống', () => {
    const step = shopMachine.transitions.find((t) => t.action === 'lose_auth');
    expect(step?.system).toBe(true);
    expect(step?.from).toContain('connecting');
  });
});
