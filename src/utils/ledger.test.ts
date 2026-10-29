import { describe, expect, it } from 'vitest';
import type { LedgerKind, LedgerLine } from '@/types/finance';
import { formatMilestone, summarizeLedger, taxMismatch, taxWarnings } from './ledger';

let seq = 0;
const line = (kind: LedgerKind, amount: number, extra: Partial<LedgerLine> = {}): LedgerLine => ({
  id: `l${++seq}`,
  code: `SO-${seq}`,
  at: '2026-10-20T00:00:00.000Z',
  kind,
  amount,
  estimated: false,
  replaced: false,
  shopId: 'shp-001',
  shopName: null,
  orderId: 'ord-1',
  orderCode: 'DH-1',
  packageId: null,
  configVersion: null,
  txnId: null,
  ref: null,
  note: null,
  bankMatched: false,
  ...extra,
});

describe('summarizeLedger', () => {
  it('thực nhận bỏ giá vốn, quảng cáo; lãi gộp trừ giá vốn; lãi đóng góp trừ thêm quảng cáo', () => {
    const s = summarizeLedger([
      line('revenue', 1_000_000, { estimated: true }),
      line('fee_fixed', -40_000, { estimated: true }),
      line('tax_withheld', -15_000, { estimated: true }),
      line('cogs', -600_000),
      line('ads', -50_000),
    ]);
    expect(s).toMatchObject({ net: 945_000, cogs: -600_000, gross: 345_000, ads: -50_000, contribution: 295_000 });
    expect(s.estimated).toBe(true);
  });

  it('dòng đã thay không tính; chỉ còn dòng thực tế thì theo quyết toán', () => {
    const s = summarizeLedger([
      line('revenue', 500_000, { estimated: true, replaced: true }),
      line('revenue', 500_000),
      line('cogs', -200_000),
    ]);
    expect(s.net).toBe(500_000);
    expect(s.estimated).toBe(false);
  });

  it('giá vốn trả lại khi nhập kho bán lại làm tăng lãi', () => {
    const s = summarizeLedger([line('revenue', 300_000), line('refund', -300_000), line('cogs', -120_000), line('cogs', 120_000)]);
    expect(s.gross).toBe(0);
  });
});

describe('taxMismatch', () => {
  it('thuế thực tế khác ước tính thì trả phần lệch', () => {
    expect(
      taxMismatch([
        line('tax_withheld', -15_000, { estimated: true, replaced: true }),
        line('tax_withheld', -20_000),
      ]),
    ).toBe(-5_000);
  });

  it('khớp hoặc chưa quyết toán thì null', () => {
    expect(
      taxMismatch([line('tax_withheld', -15_000, { estimated: true, replaced: true }), line('tax_withheld', -15_000)]),
    ).toBeNull();
    expect(taxMismatch([line('tax_withheld', -15_000, { estimated: true })])).toBeNull();
  });
});

describe('taxWarnings', () => {
  it('cảnh báo từ 90% mốc, đánh dấu đã vượt', () => {
    expect(taxWarnings(400_000_000)).toEqual([]);
    expect(taxWarnings(470_000_000)).toEqual([{ milestone: 500_000_000, ytdRevenue: 470_000_000, over: false }]);
    expect(taxWarnings(2_800_000_000).map((w) => [w.milestone, w.over])).toEqual([
      [500_000_000, true],
      [3_000_000_000, false],
    ]);
  });

  it('ghi mốc bằng chữ', () => {
    expect(formatMilestone(500_000_000)).toBe('500 triệu');
    expect(formatMilestone(3_000_000_000)).toBe('3 tỷ');
  });
});
