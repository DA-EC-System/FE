import { describe, expect, it } from 'vitest';
import { docFormSchema, draftNumber, emptyLine, toLineInputs } from './shared';

const form = (counted: string, extra: Partial<ReturnType<typeof emptyLine>> = {}) => ({
  area: 'stock' as const,
  note: '',
  lines: [emptyLine({ variantId: 'v1', sku: 'A', counted, ...extra })],
});

describe('phiếu kiểm kê: ô Thực tế (FE#468, commerio-backend#575)', () => {
  const schema = docFormSchema('stocktake');

  it('ô trống là chưa đếm: hợp lệ, không gửi counted', () => {
    const r = schema.safeParse(form('  '));
    expect(r.success).toBe(true);
    expect(toLineInputs(r.data!)).toEqual([{ variantId: 'v1' }]);
  });

  it('nhận số có dấu phân cách nghìn', () => {
    const r = schema.safeParse(form('1.200'));
    expect(r.data?.lines[0].counted).toBe(1200);
  });

  it('giữ câu lỗi cụ thể của ô số', () => {
    const msg = (v: string) => schema.safeParse(form(v)).error?.issues[0].message;
    expect(msg('-1')).toBe('Thực tế không được âm');
    expect(msg('1.5')).toBe('Thực tế là số nguyên');
    expect(msg('abc')).toBe('Thực tế là số nguyên');
  });

  it('countSource: điền theo sàn mà số còn khớp thì platform, gõ đè thì manual', () => {
    const same = schema.safeParse(form('30', { platformStock: 30, countSource: 'platform' }));
    expect(toLineInputs(same.data!)[0]).toMatchObject({ counted: 30, countSource: 'platform' });
    const typed = schema.safeParse(form('29', { platformStock: 30, countSource: 'platform' }));
    expect(toLineInputs(typed.data!)[0]).toMatchObject({ counted: 29, countSource: 'manual' });
  });

  it('tối đa 200 dòng chỉ khi tạo; sửa phiếu đầu kỳ không giới hạn', () => {
    const many = { ...form('1'), lines: Array.from({ length: 201 }, (_, i) => emptyLine({ variantId: `v${i}`, sku: `S${i}`, counted: '1' })) };
    expect(docFormSchema('stocktake', true).safeParse(many).success).toBe(false);
    expect(docFormSchema('stocktake', false).safeParse(many).success).toBe(true);
  });
});

describe('draftNumber', () => {
  it('đọc số nguyên, kể cả có dấu phân cách nghìn; chữ sai là null', () => {
    expect(draftNumber(' 12 ')).toBe(12);
    expect(draftNumber('1.200')).toBe(1200);
    expect(draftNumber('1 200')).toBe(1200);
    expect(draftNumber('1.5')).toBeNull();
    expect(draftNumber('')).toBeNull();
  });
});
