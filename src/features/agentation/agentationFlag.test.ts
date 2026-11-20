import { describe, expect, it } from 'vitest';
import { agentationEndpoint, DEFAULT_AGENTATION_ENDPOINT, resolveAgentationFlag } from './agentationFlag';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe('resolveAgentationFlag', () => {
  it('dev luôn bật, không ghi storage', () => {
    const s = memoryStorage();
    expect(resolveAgentationFlag('', s, true)).toBe(true);
    expect(s.data.size).toBe(0);
  });

  it('bản build không có cờ thì tắt', () => {
    expect(resolveAgentationFlag('', memoryStorage(), false)).toBe(false);
    expect(resolveAgentationFlag('?tab=tiktok', memoryStorage(), false)).toBe(false);
  });

  it('?agentation=1 lưu cờ, lần sau không cần tham số vẫn bật', () => {
    const s = memoryStorage();
    expect(resolveAgentationFlag('?tab=x&agentation=1', s, false)).toBe(true);
    expect(s.data.get('agentation')).toBe('1');
    expect(resolveAgentationFlag('', s, false)).toBe(true);
  });

  it('?agentation=0 xoá cờ', () => {
    const s = memoryStorage({ agentation: '1' });
    expect(resolveAgentationFlag('?agentation=0', s, false)).toBe(false);
    expect(s.data.has('agentation')).toBe(false);
  });

  it('giá trị tham số lạ thì giữ cờ cũ', () => {
    expect(resolveAgentationFlag('?agentation=yes', memoryStorage({ agentation: '1' }), false)).toBe(true);
    expect(resolveAgentationFlag('?agentation=yes', memoryStorage(), false)).toBe(false);
  });

  it('storage không dùng được hoặc ném lỗi thì tắt', () => {
    expect(resolveAgentationFlag('?agentation=1', null, false)).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };
    expect(resolveAgentationFlag('?agentation=1', broken, false)).toBe(false);
  });
});

describe('agentationEndpoint', () => {
  it('rỗng hoặc chưa đặt thì dùng mặc định', () => {
    expect(agentationEndpoint(undefined)).toBe(DEFAULT_AGENTATION_ENDPOINT);
    expect(agentationEndpoint('  ')).toBe(DEFAULT_AGENTATION_ENDPOINT);
  });
  it('dùng biến môi trường khi có', () => {
    expect(agentationEndpoint(' https://ag.example.app ')).toBe('https://ag.example.app');
  });
});
