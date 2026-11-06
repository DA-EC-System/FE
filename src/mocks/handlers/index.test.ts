import { describe, expect, it } from 'vitest';
describe('mock handlers', () => {
  // Nạp nguội mọi handler mất vài giây; chạy cả bộ song song thì vượt 5 giây mặc định
  it('nạp đủ handler', { timeout: 20_000 }, async () => {
    const { handlers } = await import('./index');
    expect(handlers.length).toBeGreaterThan(100);
  });
});
