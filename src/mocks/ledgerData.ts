import type { LedgerKind, LedgerLine } from '@/types/finance';
import type { Owned } from './financeLifecycleData';

// ---------- Sổ tiền (sơ đồ D4.1, FE#150, Documents/21 §21.1): dòng sổ chỉ thêm, ước tính được dòng thực tế thay ----------

export type MockLedgerLine = Owned<LedgerLine>;

/** Lãi tối thiểu dùng cho cờ Dưới đáy khi công ty chưa có phiên bản min_margin */
export const DEFAULT_MIN_MARGIN_PCT = 10;

/** Doanh thu năm trước khi có app, cộng vào luỹ kế để cảnh báo mốc */
export const YTD_OPENING: Record<string, number> = { 'cmp-001': 470_000_000 };

export const lines: MockLedgerLine[] = [];
/** Khoá các nghiệp vụ đã ghi sổ để sinh dòng một lần */
export const booked = new Set<string>();

let seq = 0;

export type NewLine = Pick<MockLedgerLine, 'companyId' | 'kind' | 'amount' | 'estimated' | 'occurredOn'> &
  Partial<Omit<MockLedgerLine, 'id' | 'createdAt'>>;

export function addLine(line: NewLine): MockLedgerLine {
  seq += 1;
  const full: MockLedgerLine = {
    replacesId: null,
    replacedBy: null,
    shopId: null,
    orderId: null,
    orderCode: null,
    packageId: null,
    returnRequestId: null,
    configVersionId: null,
    txnId: null,
    externalOrderId: null,
    flags: [],
    source: null,
    reason: null,
    bankMatch: null,
    ...line,
    id: `led-${seq}`,
    createdAt: new Date(Date.UTC(2026, 9, 1) + seq * 60_000).toISOString(),
  };
  lines.push(full);
  return full;
}

const shopLine = (
  occurredOn: string,
  shopId: string,
  kind: LedgerKind,
  amount: number,
  reason: string,
  extra: Partial<MockLedgerLine> = {},
) => addLine({ companyId: 'cmp-001', occurredOn, kind, amount, estimated: false, shopId, reason, ...extra });

// Dòng cấp gian hàng: số dư đầu kỳ, quảng cáo, bồi thường, rút tiền
shopLine('2026-10-01', 'shp-001', 'adjustment', 6_500_000, 'Số dư ví sàn đầu kỳ');
shopLine('2026-10-01', 'shp-002', 'adjustment', 2_400_000, 'Số dư ví sàn đầu kỳ');
shopLine('2026-10-06', 'shp-001', 'ads', -350_000, 'Quảng cáo tìm kiếm tuần 40', { txnId: 'ADS-2610-01' });
shopLine('2026-10-08', 'shp-002', 'lost_compensation', 120_000, 'Sàn bồi thường kiện thất lạc', { txnId: 'CMP-2610-07' });
// Đơn đặt trước khi kết nối gian hàng: dòng của gian hàng, cờ Không rõ đơn (E140)
shopLine('2026-10-09', 'shp-001', 'revenue', 189_000, 'Item Price Credit', {
  txnId: 'VN-LZD-2610-090',
  externalOrderId: '700000000000009',
  flags: ['unknown_order'],
});
shopLine('2026-10-10', 'shp-001', 'withdrawal', -2_000_000, 'Rút về Vietcombank', { txnId: 'WD-2610-01' });
