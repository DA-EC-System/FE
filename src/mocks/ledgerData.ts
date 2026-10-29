import type { LedgerKind } from '@/types/finance';

// ---------- Sổ tiền (sơ đồ D4.1, FE#76): dòng sổ chỉ thêm, ước tính bị thay bằng thực tế ----------

export interface MockLedgerLine {
  id: string;
  companyId: string;
  code: string;
  at: string;
  kind: LedgerKind;
  amount: number;
  estimated: boolean;
  replaced: boolean;
  shopId: string | null;
  orderId: string | null;
  packageId: string | null;
  configVersion: string | null;
  txnId: string | null;
  note: string | null;
  bankMatched: boolean;
}

/** Cấu hình phí, thuế của sàn dùng để ước tính; đổi cấu hình thì tăng phiên bản */
export const FEE_CONFIG = {
  version: 'CH-000001',
  fixedRate: 0.04,
  txnRate: 0.025,
  returnFee: 20000,
};
export const TAX_CONFIG = { version: 'CH-000002', rate: 0.015 };

/** Doanh thu năm trước khi có app, cộng vào luỹ kế để cảnh báo mốc */
export const YTD_OPENING: Record<string, number> = { 'cmp-001': 470_000_000 };

export const lines: MockLedgerLine[] = [];
/** Khoá các nghiệp vụ đã ghi sổ để sinh dòng một lần */
export const booked = new Set<string>();

let seq = 0;

export function addLine(line: Omit<MockLedgerLine, 'id' | 'code' | 'replaced' | 'bankMatched'> & { bankMatched?: boolean }) {
  seq += 1;
  const full: MockLedgerLine = {
    ...line,
    id: `led-${seq}`,
    code: `SO-${String(seq).padStart(6, '0')}`,
    replaced: false,
    bankMatched: line.bankMatched ?? false,
  };
  lines.push(full);
  return full;
}

const shopLine = (
  at: string,
  shopId: string,
  kind: LedgerKind,
  amount: number,
  note: string,
  extra: { txnId?: string; bankMatched?: boolean } = {},
) =>
  addLine({
    companyId: 'cmp-001',
    at,
    kind,
    amount,
    estimated: false,
    shopId,
    orderId: null,
    packageId: null,
    configVersion: null,
    txnId: extra.txnId ?? null,
    note,
    bankMatched: extra.bankMatched,
  });

// Dòng cấp gian hàng: số dư đầu kỳ, quảng cáo, bồi thường, rút tiền
shopLine('2026-10-01T00:00:00.000Z', 'shp-001', 'adjustment', 6_500_000, 'Số dư ví sàn đầu kỳ');
shopLine('2026-10-01T00:00:00.000Z', 'shp-002', 'adjustment', 2_400_000, 'Số dư ví sàn đầu kỳ');
shopLine('2026-10-06T03:00:00.000Z', 'shp-001', 'ads', -350_000, 'Quảng cáo tìm kiếm tuần 40', { txnId: 'ADS-2610-01' });
shopLine('2026-10-08T05:00:00.000Z', 'shp-002', 'compensation', 120_000, 'Sàn bồi thường kiện thất lạc', {
  txnId: 'CMP-2610-07',
});
shopLine('2026-10-10T02:00:00.000Z', 'shp-001', 'withdrawal', -2_000_000, 'Rút về Vietcombank', {
  txnId: 'WD-2610-01',
  bankMatched: true,
});
