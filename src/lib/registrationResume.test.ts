import { describe, expect, it } from 'vitest';
import { clearPendingRegistration, loadPendingRegistration, savePendingRegistration } from './registrationResume';

function memory() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const NOW = Date.parse('2026-11-24T10:00:00Z');
const status = {
  registrationId: 'r1',
  codeExpiresAt: '2026-11-24T10:05:00Z',
  registrationExpiresAt: '2026-11-24T10:30:00Z',
  resendAfterSeconds: 60,
};

describe('registrationResume (FE#468, N2)', () => {
  it('tải lại trong hạn thì về đúng màn nhập mã', () => {
    const s = memory();
    savePendingRegistration({ email: 'a@b.vn', status }, s);
    expect(loadPendingRegistration(NOW, s)).toEqual({ email: 'a@b.vn', status });
  });

  it('quá hạn lần đăng ký thì bỏ và xoá', () => {
    const s = memory();
    savePendingRegistration({ email: 'a@b.vn', status }, s);
    expect(loadPendingRegistration(Date.parse('2026-11-24T10:31:00Z'), s)).toBeNull();
    expect(s.map.size).toBe(0);
  });

  it('dữ liệu hỏng hoặc thiếu thì bỏ và xoá', () => {
    const s = memory();
    s.setItem('commerio_pending_registration', '{oops');
    expect(loadPendingRegistration(NOW, s)).toBeNull();
    expect(s.map.size).toBe(0);
    s.setItem('commerio_pending_registration', JSON.stringify({ email: 'a@b.vn' }));
    expect(loadPendingRegistration(NOW, s)).toBeNull();
  });

  it('xác minh xong hoặc sửa thông tin thì xoá; không có bộ nhớ thì không lỗi', () => {
    const s = memory();
    savePendingRegistration({ email: 'a@b.vn', status }, s);
    clearPendingRegistration(s);
    expect(loadPendingRegistration(NOW, s)).toBeNull();
    expect(loadPendingRegistration(NOW, null)).toBeNull();
    expect(() => savePendingRegistration({ email: 'a@b.vn', status }, null)).not.toThrow();
  });

  it('không lưu mật khẩu', () => {
    const s = memory();
    savePendingRegistration({ email: 'a@b.vn', status }, s);
    expect([...s.map.values()].join('')).not.toMatch(/password/i);
  });
});
