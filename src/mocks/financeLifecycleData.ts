import type { FinanceConfig } from '@/types/finance';
import type { OrderPaymentDetail, SettlementLedgerLine, SettlementRun, SettlementStatus } from '@/types/settlement';
import { orders } from './salesData';
import { db } from './db';
import { todayVn } from '@/features/finance/lifecycleShared';
const now = () => new Date().toISOString();
const day = (n: number) => new Date(Date.now() + n * 86400000 + 7 * 3600000).toISOString().slice(0, 10);
export type Owned<T> = T & { companyId: string };
export const configs: Owned<FinanceConfig>[] = db.companies.flatMap((company) => {
  const shop = db.shops.find((s) => s.companyId === company.id);
  return [{ id: `cfg-${company.id}`, companyId: company.id, kind: 'fee', shopId: shop?.id ?? null,
    payload: { fixedPct: 3, transactionPct: 2, servicePct: 1, optionalPct: 0, returnFee: 10000 },
    effectiveFrom: day(-30), effectiveTo: null, supersedesId: null, isCorrection: false, retroactiveFrom: null,
    status: 'active', statusReason: null, createdBy: { id: 'acc-005', name: 'Admin demo' }, approvedBy: { id: 'acc-001', name: 'CEO demo' },
    selfApproved: false, dryRun: null, createdAt: now(), version: 1, statusHistory: [],
  } satisfies Owned<FinanceConfig>];
});
export const payments: Owned<OrderPaymentDetail>[] = orders.map((order, i) => {
  const status: SettlementStatus = ['mismatch', 'mismatch', 'pending', 'settled', 'resolved', 'none'][i % 6] as SettlementStatus;
  return { companyId: order.companyId, orderId: order.id, orderCode: order.code, shopId: order.shopId,
    status, estimatedTotal: 500000, settledTotal: ['none', 'pending'].includes(status) ? null : 460000,
    diff: ['none', 'pending'].includes(status) ? null : -40000,
    threshold: { abs: 1000, pct: 1, resolveLimit: i % 2 ? 10000 : 100000 }, needsCeoApproval: status === 'mismatch' && i % 2 === 1,
    ceoApproval: null, resolved: status === 'resolved' ? { by: { id: 'acc-001', name: 'CEO demo' }, at: now(), reason: 'Đã xác minh phí sàn' } : null,
    feeConfigAuthor: { id: 'fee-author-demo', name: 'Người soạn phí demo' }, version: 1, statusHistory: [], lines: [],
  };
});
export const bankLines: Owned<SettlementLedgerLine>[] = db.companies.map((c) => ({
  id: `withdraw-${c.id}`, companyId: c.id, kind: 'withdrawal', amount: -1500000, estimated: false,
  replacesId: null, replacedBy: null, occurredOn: todayVn(), shopId: db.shops.find((s) => s.companyId === c.id)?.id ?? null,
  orderId: null, orderCode: null, packageId: null, returnRequestId: null, configVersionId: null, txnId: `txn-${c.id}`,
  source: null, reason: 'Rút tiền từ ví sàn demo', createdAt: now(), bankMatch: null,
}));
export const runs: Owned<SettlementRun>[] = db.shops.map((shop) => ({ id: `run-${shop.id}`, companyId: shop.companyId,
  shopId: shop.id, source: 'api', fileId: null, from: new Date(Date.now() - 86400000).toISOString(), to: now(),
  status: 'done', lineCount: 12, duplicates: 2, walletDiff: shop.id === 'shp-003' ? 12000 : null, error: null,
  createdBy: 'acc-001', createdAt: now(),
}));
export function publicRow<T>(row: Owned<T>): T { const { companyId: _companyId, ...rest } = row; return rest as T; }

// Dòng tiền mẫu có ước tính đã được thay, số thực tế và giá vốn.
for (const payment of payments) {
  if (payment.status === 'none') continue;
  const common = { amount: 500000, occurredOn: todayVn(), shopId: payment.shopId, orderId: payment.orderId,
    orderCode: payment.orderCode, packageId: null, returnRequestId: null, configVersionId: `cfg-${payment.companyId}`,
    txnId: null, source: null, reason: null, createdAt: now(), bankMatch: null };
  payment.lines = [{ ...common, id: `estimate-${payment.orderId}`, kind: 'revenue', estimated: true, replacesId: null,
    replacedBy: payment.settledTotal === null ? null : `actual-${payment.orderId}` }];
  if (payment.settledTotal !== null) payment.lines.push({ ...common, id: `actual-${payment.orderId}`, kind: 'revenue', estimated: false,
    replacesId: `estimate-${payment.orderId}`, replacedBy: null, amount: payment.settledTotal, txnId: `txn-${payment.orderId}` });
}
