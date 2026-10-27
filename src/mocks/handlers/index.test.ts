import { describe, expect, it } from 'vitest';
describe('mock handlers', () => {
  it('nạp đủ handler', async () => {
    const { handlers } = await import('./handlers');
    expect(handlers.length).toBeGreaterThan(100);
  });
});
