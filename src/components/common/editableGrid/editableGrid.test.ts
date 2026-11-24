import { describe, expect, it, vi } from 'vitest';
import { parseCell } from './cellParse';
import { cellKey, errorCount, statusReducer, type CellStatuses } from './cellStatus';
import { afterCommit, editKeyAction, idleKeyAction, moveTarget } from './gridKeys';
import { readLocked, writeLocked } from './gridLock';
import { RowSaveQueue, type SaveResult } from './rowSaveQueue';

const pos = { row: 1, col: 1 };
const idle = (key: string, editable: boolean, extra: object = {}) =>
  idleKeyAction({ key, ...extra }, { pos, rows: 3, cols: 4, editable });

describe('gridKeys: di chuyển bằng mũi tên', () => {
  it('mũi tên đi một ô, dừng ở mép', () => {
    expect(moveTarget(pos, { key: 'ArrowUp' }, 3, 4)).toEqual({ row: 0, col: 1 });
    expect(moveTarget(pos, { key: 'ArrowDown' }, 3, 4)).toEqual({ row: 2, col: 1 });
    expect(moveTarget(pos, { key: 'ArrowLeft' }, 3, 4)).toEqual({ row: 1, col: 0 });
    expect(moveTarget(pos, { key: 'ArrowRight' }, 3, 4)).toEqual({ row: 1, col: 2 });
    expect(moveTarget({ row: 0, col: 0 }, { key: 'ArrowUp' }, 3, 4)).toEqual({ row: 0, col: 0 });
    expect(moveTarget({ row: 2, col: 3 }, { key: 'ArrowRight' }, 3, 4)).toEqual({ row: 2, col: 3 });
  });

  it('Home, End trong dòng; Ctrl+Home, Ctrl+End về góc bảng', () => {
    expect(moveTarget(pos, { key: 'Home' }, 3, 4)).toEqual({ row: 1, col: 0 });
    expect(moveTarget(pos, { key: 'End' }, 3, 4)).toEqual({ row: 1, col: 3 });
    expect(moveTarget(pos, { key: 'Home', ctrlKey: true }, 3, 4)).toEqual({ row: 0, col: 0 });
    expect(moveTarget(pos, { key: 'End', ctrlKey: true }, 3, 4)).toEqual({ row: 2, col: 3 });
  });

  it('bảng trống hoặc phím khác thì không di chuyển', () => {
    expect(moveTarget(pos, { key: 'ArrowUp' }, 0, 4)).toBeNull();
    expect(moveTarget(pos, { key: 'a' }, 3, 4)).toBeNull();
  });
});

describe('gridKeys: mở sửa bằng Enter, F2, gõ đè', () => {
  it('Enter, F2 mở sửa giữ giá trị; gõ một ký tự thì gõ đè', () => {
    expect(idle('Enter', true)).toEqual({ type: 'edit', initial: null });
    expect(idle('F2', true)).toEqual({ type: 'edit', initial: null });
    expect(idle('7', true)).toEqual({ type: 'edit', initial: '7' });
  });

  it('phím kèm Ctrl, Alt hay phím chức năng không gõ đè', () => {
    expect(idle('c', true, { ctrlKey: true })).toEqual({ type: 'none' });
    expect(idle('7', true, { altKey: true })).toEqual({ type: 'none' });
    expect(idle('Shift', true)).toEqual({ type: 'none' });
  });

  it('ô không sửa được: Enter, Space bấm nút trong ô, F2 không làm gì', () => {
    expect(idle('Enter', false)).toEqual({ type: 'activate' });
    expect(idle(' ', false)).toEqual({ type: 'activate' });
    expect(idle('F2', false)).toEqual({ type: 'none' });
  });
});

describe('gridKeys: khoá sửa', () => {
  it('đang khoá (editable false): mũi tên vẫn chọn ô, gõ phím không mở sửa', () => {
    expect(idle('ArrowDown', false)).toEqual({ type: 'move', to: { row: 2, col: 1 } });
    expect(idle('5', false)).toEqual({ type: 'none' });
  });

  it('Ctrl+E, Cmd+E bật tắt khoá ở cả hai trạng thái', () => {
    expect(idle('e', false, { ctrlKey: true })).toEqual({ type: 'toggleLock' });
    expect(idle('E', true, { metaKey: true })).toEqual({ type: 'toggleLock' });
  });
});

describe('gridKeys: khi đang sửa', () => {
  it('Enter lưu rồi xuống, Tab lưu rồi sang phải, Shift+Tab sang trái, Esc huỷ', () => {
    expect(editKeyAction({ key: 'Enter' })).toEqual({ type: 'commit', then: 'down' });
    expect(editKeyAction({ key: 'Tab' })).toEqual({ type: 'commit', then: 'right' });
    expect(editKeyAction({ key: 'Tab', shiftKey: true })).toEqual({ type: 'commit', then: 'left' });
    expect(editKeyAction({ key: 'Escape' })).toEqual({ type: 'cancel' });
    expect(editKeyAction({ key: 'ArrowDown' })).toEqual({ type: 'none' });
  });

  it('ô sau khi lưu, dừng ở mép', () => {
    expect(afterCommit(pos, 'down', 3, 4)).toEqual({ row: 2, col: 1 });
    expect(afterCommit({ row: 2, col: 1 }, 'down', 3, 4)).toEqual({ row: 2, col: 1 });
    expect(afterCommit(pos, 'right', 3, 4)).toEqual({ row: 1, col: 2 });
    expect(afterCommit({ row: 1, col: 0 }, 'left', 3, 4)).toEqual({ row: 1, col: 0 });
  });
});

describe('gridLock', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };

  it('mặc định khoá; nhớ theo từng gridId', () => {
    const s = memory();
    expect(readLocked('bulk', s)).toBe(true);
    writeLocked('bulk', false, s);
    expect(readLocked('bulk', s)).toBe(false);
    expect(readLocked('variants', s)).toBe(true);
    writeLocked('bulk', true, s);
    expect(readLocked('bulk', s)).toBe(true);
  });

  it('bộ nhớ ném lỗi hoặc không có thì coi như khoá', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(readLocked('bulk', broken)).toBe(true);
    expect(() => writeLocked('bulk', false, broken)).not.toThrow();
    expect(readLocked('bulk', null)).toBe(true);
  });
});

describe('RowSaveQueue', () => {
  const deferred = <T,>() => {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
  };

  it('cùng dòng gửi lần lượt, lượt sau dùng version lượt trước trả về', async () => {
    const q = new RowSaveQueue<number>();
    const sent: number[] = [];
    const first = deferred<SaveResult<number>>();
    const a = q.run('r1', () => 5, (v) => {
      sent.push(v);
      return first.promise;
    });
    const b = q.run('r1', () => 5, async (v) => {
      sent.push(v);
      return { ok: true, version: v + 1 };
    });
    await Promise.resolve();
    // Lượt hai chưa gửi khi lượt một chưa xong
    expect(sent).toEqual([5]);
    first.resolve({ ok: true, version: 6 });
    await a;
    expect(await b).toEqual({ ok: true, version: 7 });
    expect(sent).toEqual([5, 6]);
  });

  it('dòng khác gửi song song, mỗi dòng version riêng', async () => {
    const q = new RowSaveQueue<number>();
    const sent: string[] = [];
    const hold = deferred<SaveResult<number>>();
    void q.run('r1', () => 1, (v) => {
      sent.push(`r1@${v}`);
      return hold.promise;
    });
    await q.run('r2', () => 9, async (v) => {
      sent.push(`r2@${v}`);
      return { ok: true, version: v + 1 };
    });
    expect(sent).toEqual(['r1@1', 'r2@9']);
    hold.resolve({ ok: true, version: 2 });
  });

  it('xung đột version: trả lỗi kèm conflict, không ghi version mới', async () => {
    const q = new RowSaveQueue<number>();
    const conflict = await q.run('r1', () => 3, async () => ({ ok: false, error: 'Người khác vừa sửa', conflict: true }));
    expect(conflict).toEqual({ ok: false, error: 'Người khác vừa sửa', conflict: true });
    // Hết lượt thì quên version; lượt sau đọc lại từ bảng (đã tải lại dòng)
    const sent: number[] = [];
    await q.run('r1', () => 4, async (v) => {
      sent.push(v);
      return { ok: true, version: v + 1 };
    });
    expect(sent).toEqual([4]);
  });

  it('lượt ném lỗi không chặn lượt sau của dòng; báo bận đúng lúc', async () => {
    const busy = vi.fn();
    const q = new RowSaveQueue<number>(busy);
    const failing = q.run('r1', () => 1, async () => {
      throw new Error('mạng');
    });
    const next = q.run('r1', () => 1, async (v) => ({ ok: true, version: v + 1 }));
    expect(q.busy).toBe(true);
    await expect(failing).rejects.toThrow('mạng');
    expect(await next).toEqual({ ok: true, version: 2 });
    await Promise.resolve();
    await Promise.resolve();
    expect(q.busy).toBe(false);
    expect(busy.mock.calls).toEqual([[true], [false]]);
  });
});

describe('cellStatus: lỗi theo ô', () => {
  const k = cellKey('r1', 'standardPrice');

  it('lỗi giữ chữ đã gõ, không lan sang ô khác', () => {
    let s: CellStatuses = {};
    s = statusReducer(s, { type: 'saving', rowId: 'r1', columnId: 'standardPrice', draft: '120.000' });
    s = statusReducer(s, { type: 'saved', rowId: 'r1', columnId: 'weightG' });
    s = statusReducer(s, { type: 'error', rowId: 'r1', columnId: 'standardPrice', message: 'Giá quá thấp', draft: '120.000' });
    expect(s[k]).toEqual({ kind: 'error', message: 'Giá quá thấp', draft: '120.000', conflict: undefined });
    expect(s[cellKey('r1', 'weightG')]).toEqual({ kind: 'saved' });
    expect(errorCount(s)).toBe(1);
  });

  it('✓ hết hạn chỉ khi ô còn ở trạng thái đã lưu', () => {
    let s: CellStatuses = statusReducer({}, { type: 'saved', rowId: 'r1', columnId: 'standardPrice' });
    s = statusReducer(s, { type: 'saving', rowId: 'r1', columnId: 'standardPrice', draft: '1' });
    expect(statusReducer(s, { type: 'expire', rowId: 'r1', columnId: 'standardPrice' })).toBe(s);
    const saved = statusReducer({}, { type: 'saved', rowId: 'r1', columnId: 'standardPrice' });
    expect(statusReducer(saved, { type: 'expire', rowId: 'r1', columnId: 'standardPrice' })).toEqual({});
  });

  it('tải lại dòng xoá trạng thái mọi ô của dòng đó', () => {
    let s: CellStatuses = {};
    s = statusReducer(s, { type: 'error', rowId: 'r1', columnId: 'a', message: 'x', draft: '1', conflict: true });
    s = statusReducer(s, { type: 'error', rowId: 'r10', columnId: 'a', message: 'y', draft: '2' });
    s = statusReducer(s, { type: 'clearRow', rowId: 'r1' });
    expect(Object.keys(s)).toEqual([cellKey('r10', 'a')]);
  });
});

describe('parseCell', () => {
  it('trống là xoá; số có dấu ngăn nghìn', () => {
    expect(parseCell('  ')).toEqual({ ok: true, value: null });
    expect(parseCell('199.000')).toEqual({ ok: true, value: 199000 });
    expect(parseCell('1 200')).toEqual({ ok: true, value: 1200 });
  });

  it('số âm, số 0, chữ, số thập phân là sai; vượt giới hạn báo câu riêng', () => {
    expect(parseCell('0')).toEqual({ ok: false, error: 'Nhập số lớn hơn 0' });
    expect(parseCell('-5')).toEqual({ ok: false, error: 'Nhập số lớn hơn 0' });
    expect(parseCell('abc')).toEqual({ ok: false, error: 'Nhập số lớn hơn 0' });
    expect(parseCell('2500', { max: 2000, tooBig: 'Quá 2 m' })).toEqual({ ok: false, error: 'Quá 2 m' });
  });
});
