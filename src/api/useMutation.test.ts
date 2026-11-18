// Chặn bấm đúp (FE#247; Documents/25 N5): hai lần gửi liền cùng biến chỉ gọi API một lần
import { describe, expect, it, vi } from 'vitest';
import { createSingleFlight, variablesKey } from './useMutation';

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createSingleFlight', () => {
  it('hai lần gửi liền cùng biến: gọi API một lần, lần sau không chạy tiếp đoạn sau await', async () => {
    const run = createSingleFlight();
    const call = deferred<string>();
    const api = vi.fn(() => call.promise);
    const after = vi.fn();

    void run({ roleIds: ['role-admin'] }, api).then(after);
    void run({ roleIds: ['role-admin'] }, api).then(after);
    expect(api).toHaveBeenCalledTimes(1);

    call.resolve('ok');
    await flush();
    expect(after).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledWith('ok');
  });

  it('xong rồi thì gửi lại được', async () => {
    const run = createSingleFlight();
    const api = vi.fn(() => Promise.resolve(1));
    await run('inv-1', api);
    await run('inv-1', api);
    expect(api).toHaveBeenCalledTimes(2);
  });

  it('lỗi cũng mở khoá; lỗi trả về lời gọi đầu', async () => {
    const run = createSingleFlight();
    const api = vi.fn().mockRejectedValueOnce(new Error('409')).mockResolvedValueOnce('ok');
    await expect(run('x', api)).rejects.toThrow('409');
    await expect(run('x', api)).resolves.toBe('ok');
  });

  it('biến khác nhau (hai dòng khác nhau) chạy song song', () => {
    const run = createSingleFlight();
    const api = vi.fn(() => new Promise(() => undefined));
    void run({ id: 'a' }, api);
    void run({ id: 'b' }, api);
    void run(undefined, api);
    expect(api).toHaveBeenCalledTimes(3);
  });

  it('start ném lỗi đồng bộ thì mở khoá', () => {
    const run = createSingleFlight();
    expect(() =>
      run('x', () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    const api = vi.fn(() => Promise.resolve(1));
    void run('x', api);
    expect(api).toHaveBeenCalledTimes(1);
  });
});

describe('variablesKey', () => {
  it('cùng nội dung cho cùng khoá', () => {
    expect(variablesKey({ a: 1, b: [2] })).toBe(variablesKey({ a: 1, b: [2] }));
    expect(variablesKey(undefined)).toBe('');
  });

  it('tệp khác nhau cho khoá khác nhau', () => {
    const a = new File(['a'], 'a.png', { lastModified: 1 });
    const b = new File(['bb'], 'b.png', { lastModified: 1 });
    expect(variablesKey({ file: a })).not.toBe(variablesKey({ file: b }));
  });

  it('Blob so theo chính đối tượng: hai Blob cùng kiểu, cùng cỡ vẫn khác khoá; cùng một Blob thì trùng', () => {
    const a = new Blob(['aa'], { type: 'image/png' });
    const b = new Blob(['bb'], { type: 'image/png' });
    expect(variablesKey({ blob: a })).not.toBe(variablesKey({ blob: b }));
    expect(variablesKey({ blob: a })).toBe(variablesKey({ blob: a }));
  });

  it('biến vòng tròn không đổi ra JSON: mỗi lần một khoá riêng, không chặn nhầm', () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(variablesKey(loop)).not.toBe(variablesKey(loop));
  });
});
