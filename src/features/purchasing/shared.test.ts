import { describe, expect, it } from 'vitest';
import { hasActiveSupplier, receiptFormSchema, returnFormSchema, shortOfDraft, type ReceiptLineDraft } from './shared';

const line = (over: Partial<ReceiptLineDraft> = {}): ReceiptLineDraft => ({
  lineId: 'l1',
  sku: 'SKU-1',
  productName: 'Áo',
  attributesLabel: '',
  outstanding: 10,
  announced: '10',
  accepted: '10',
  defectKept: '0',
  returnedOnSpot: '0',
  reason: '',
  ...over,
});

const receipt = (l: ReceiptLineDraft) => receiptFormSchema.safeParse({ deliveryMode: 'waiting', note: '', lines: [l] });
const issues = (r: ReturnType<typeof receipt>) =>
  r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);

describe('Phiếu nhận: kiểm đếm (sơ đồ A2)', () => {
  it('thiếu = báo giao − đạt − lỗi giữ − trả tại chỗ; chữ chưa hợp lệ coi là 0', () => {
    expect(shortOfDraft(line({ announced: '10', accepted: '6', defectKept: '1', returnedOnSpot: '1' }))).toBe(2);
    expect(shortOfDraft(line({ announced: '5', accepted: 'abc' }))).toBe(5);
    expect(shortOfDraft(line({ announced: '3', accepted: '5' }))).toBe(0);
  });

  it('đủ hàng, không lỗi thì không cần lý do', () => {
    expect(receipt(line()).success).toBe(true);
  });

  it('có thiếu, lỗi hoặc trả tại chỗ thì bắt buộc lý do', () => {
    expect(issues(receipt(line({ accepted: '8' })))).toEqual(['lines.0.reason: Ghi lý do khi có thiếu, lỗi hoặc trả lại']);
    expect(receipt(line({ accepted: '8', reason: 'Nhà cung cấp giao thiếu 2' })).success).toBe(true);
    expect(receipt(line({ accepted: '9', defectKept: '1' })).success).toBe(false);
  });

  it('đạt + lỗi + trả không vượt báo giao; đạt + lỗi không vượt còn chờ', () => {
    expect(issues(receipt(line({ announced: '10', accepted: '9', defectKept: '2', reason: 'x' })))).toEqual([
      'lines.0.accepted: SL đạt + lỗi + trả lại vượt SL NCC giao',
    ]);
    expect(issues(receipt(line({ outstanding: 5, announced: '8', accepted: '6', reason: 'x' })))).toEqual([
      'lines.0.accepted: Còn phải nhận 5, SL đạt và lỗi vượt số này',
    ]);
  });
});

describe('Phiếu trả nhà cung cấp (sơ đồ B4)', () => {
  it('số trả không vượt hàng lỗi/chờ kiểm, phải có ít nhất một dòng', () => {
    const parse = (quantity: string) =>
      returnFormSchema.safeParse({ supplierId: 's1', note: '', lines: [{ variantId: 'v1', quarantine: 3, quantity }] });
    expect(parse('3').success).toBe(true);
    const over = parse('4');
    expect(over.success ? '' : over.error.issues[0]?.message).toBe('Chỉ còn 3 hàng lỗi/chờ kiểm');
    const empty = returnFormSchema.safeParse({ supplierId: '', note: '', lines: [] });
    expect(empty.success ? '' : empty.error.issues[0]?.message).toBe('Thêm ít nhất một dòng');
  });
});

describe('hasActiveSupplier: chặn Lập đề nghị khi chưa có nhà cung cấp', () => {
  it('chưa tải xong danh sách thì không chặn', () => {
    expect(hasActiveSupplier(undefined)).toBeUndefined();
  });
  it('chưa có nhà cung cấp nào, hoặc tất cả đã ngừng giao dịch, thì chặn', () => {
    expect(hasActiveSupplier([])).toBe(false);
    expect(hasActiveSupplier([{ active: false }])).toBe(false);
  });
  it('có ít nhất một nhà cung cấp đang giao dịch thì cho lập', () => {
    expect(hasActiveSupplier([{ active: false }, { active: true }])).toBe(true);
  });
});
