import { describe, expect, it } from 'vitest';
import type { Account } from '@/types/auth';
import { shouldReloadOnAuthMessage } from './authStore';

const acc = (id: string) => ({ id }) as Account;

describe('Đồng bộ đăng nhập giữa các tab (FE#317)', () => {
  it('tab đang khởi động chưa có tài khoản: bỏ qua tài khoản tab khác báo', () => {
    expect(shouldReloadOnAuthMessage('a1', { status: 'loading', account: null })).toBe(false);
  });

  it('tab đang khởi động nhận đăng xuất thì vẫn tải lại (token xin được trước khi cookie bị huỷ)', () => {
    expect(shouldReloadOnAuthMessage(null, { status: 'loading', account: null })).toBe(true);
  });

  it('cùng tài khoản thì ở lại', () => {
    expect(shouldReloadOnAuthMessage('a1', { status: 'ready', account: acc('a1') })).toBe(false);
    expect(shouldReloadOnAuthMessage('a1', { status: 'loading', account: acc('a1') })).toBe(false);
  });

  it('đăng xuất hoặc đổi tài khoản ở tab khác thì tải lại', () => {
    expect(shouldReloadOnAuthMessage(null, { status: 'ready', account: acc('a1') })).toBe(true);
    expect(shouldReloadOnAuthMessage('a2', { status: 'ready', account: acc('a1') })).toBe(true);
  });

  it('đang ở trang đăng nhập (khởi động xong, không phiên), tab khác đăng nhập thì tải lại', () => {
    expect(shouldReloadOnAuthMessage('a1', { status: 'ready', account: null })).toBe(true);
  });
});
