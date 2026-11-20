import { describe, expect, it } from 'vitest';
import {
  agentationEndpoint,
  DEFAULT_AGENTATION_ENDPOINT,
  isAgentationShortcut,
  readAgentationOn,
  resolveAgentationFlag,
  writeAgentationOn,
} from './agentationFlag';

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

describe('bật/tắt theo tab', () => {
  it('mặc định tắt', () => {
    expect(readAgentationOn(memoryStorage())).toBe(false);
    expect(readAgentationOn(null)).toBe(false);
  });

  it('bật rồi tắt: tắt thì xoá khoá', () => {
    const s = memoryStorage();
    writeAgentationOn(s, true);
    expect(readAgentationOn(s)).toBe(true);
    writeAgentationOn(s, false);
    expect(readAgentationOn(s)).toBe(false);
    expect(s.data.size).toBe(0);
  });

  it('storage ném lỗi thì đọc là tắt, ghi không làm vỡ', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };
    expect(readAgentationOn(broken)).toBe(false);
    expect(() => writeAgentationOn(broken, true)).not.toThrow();
  });
});

describe('isAgentationShortcut', () => {
  const key = { code: 'KeyA', ctrlKey: true, altKey: true, shiftKey: false, metaKey: false, repeat: false };
  it('Ctrl+Alt+A', () => expect(isAgentationShortcut(key)).toBe(true));
  it('không nhận phím của Chrome hay của app', () => {
    expect(isAgentationShortcut({ ...key, altKey: false, shiftKey: true })).toBe(false); // Ctrl+Shift+A: tìm tab
    expect(isAgentationShortcut({ ...key, ctrlKey: false, shiftKey: true })).toBe(false); // Alt+Shift+A
    expect(isAgentationShortcut({ ...key, altKey: false })).toBe(false); // Ctrl+A: chọn hết
    expect(isAgentationShortcut({ ...key, code: 'KeyK', altKey: false })).toBe(false); // Ctrl+K: bảng lệnh
  });
  it('giữ phím (repeat) không bật tắt liên tục', () => expect(isAgentationShortcut({ ...key, repeat: true })).toBe(false));
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
