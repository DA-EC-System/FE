import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanyContext } from '@/types/auth';
import { GUIDES } from './registry';
import { visibleSteps } from './steps';
import { GUIDES_OFF_KEY, guidesAutoOff, hasSeen, markSeen, resetAllSeen, seenKey } from './storage';
import type { GuideStep } from './types';

/** localStorage trong bộ nhớ, đủ hàm storage.ts dùng */
function memoryStorage() {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

describe('lưu trạng thái đã xem', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('chưa xem thì false, xem rồi thì true, khoá theo người dùng và trang', () => {
    expect(hasSeen('u1', 'company-home', 1)).toBe(false);
    markSeen('u1', 'company-home', 1);
    expect(localStorage.getItem('commerio.guide.u1.company-home')).toBe('1');
    expect(hasSeen('u1', 'company-home', 1)).toBe(true);
    expect(hasSeen('u2', 'company-home', 1)).toBe(false);
    expect(hasSeen('u1', 'orders', 1)).toBe(false);
  });

  it('tăng version thì hiện lại', () => {
    markSeen('u1', 'company-home', 1);
    expect(hasSeen('u1', 'company-home', 2)).toBe(false);
    markSeen('u1', 'company-home', 2);
    expect(hasSeen('u1', 'company-home', 2)).toBe(true);
  });

  it('bật lại tất cả chỉ xoá khoá của người đó', () => {
    markSeen('u1', 'company-home', 1);
    markSeen('u1', 'orders', 3);
    markSeen('u2', 'orders', 1);
    localStorage.setItem('khac', 'x');
    resetAllSeen('u1');
    expect(hasSeen('u1', 'company-home', 1)).toBe(false);
    expect(hasSeen('u1', 'orders', 1)).toBe(false);
    expect(hasSeen('u2', 'orders', 1)).toBe(true);
    expect(localStorage.getItem('khac')).toBe('x');
  });

  it('cờ tắt tự hiện; bật lại tất cả thì gỡ cờ', () => {
    expect(guidesAutoOff()).toBe(false);
    localStorage.setItem(GUIDES_OFF_KEY, 'off');
    expect(guidesAutoOff()).toBe(true);
    resetAllSeen('u1');
    expect(guidesAutoOff()).toBe(false);
  });

  it('localStorage bị chặn: không ném lỗi, coi như chưa xem', () => {
    const broken = () => {
      throw new Error('SecurityError');
    };
    vi.stubGlobal('localStorage', { getItem: broken, setItem: broken, removeItem: broken, key: broken, length: 0 });
    expect(() => markSeen('u1', 'company-home', 1)).not.toThrow();
    expect(hasSeen('u1', 'company-home', 1)).toBe(false);
    expect(() => resetAllSeen('u1')).not.toThrow();
    expect(guidesAutoOff()).toBe(false);
    expect(seenKey('u1', 'x')).toBe('commerio.guide.u1.x');
  });
});

describe('visibleSteps', () => {
  const ctx: CompanyContext = {
    companyId: 'cmp-001',
    companyName: 'Công ty thử',
    roles: [],
    permissions: ['sales.order.view'],
    enabledModules: ['channel'],
  };
  const steps: GuideStep[] = [
    { target: 'a', title: 'A', body: '' },
    { target: 'thieu', title: 'Thiếu phần tử', body: '' },
    { target: 'b', title: 'Thiếu quyền', body: '', permission: 'finance.invoice.view' },
    { target: 'c', title: 'Phân hệ tắt', body: '', module: 'purchasing' },
    { target: 'd', title: 'Đủ quyền, phân hệ bật', body: '', permission: ['sales.order.view'], module: 'channel' },
  ];
  const found = new Set(['a', 'b', 'c', 'd']);
  const find = (t: string) => (found.has(t) ? ({} as Element) : null);

  it('bỏ bước thiếu phần tử, thiếu quyền, phân hệ tắt', () => {
    expect(visibleSteps(steps, ctx, find).map((s) => s.target)).toEqual(['a', 'd']);
  });

  it('không có công ty: chỉ giữ bước không đòi quyền hay phân hệ', () => {
    expect(visibleSteps(steps, null, find).map((s) => s.target)).toEqual(['a']);
  });
});

describe('registry', () => {
  it('mỗi hướng dẫn có 2–4 ý giới thiệu, khoá trùng tên', () => {
    for (const [key, g] of Object.entries(GUIDES)) {
      expect(g.key).toBe(key);
      expect(g.intro.length).toBeGreaterThanOrEqual(2);
      expect(g.intro.length).toBeLessThanOrEqual(4);
      expect(g.version).toBeGreaterThanOrEqual(1);
    }
  });
});
