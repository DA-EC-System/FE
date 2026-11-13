import * as sales from '../salesData';
import type { DocRef, OrderRef } from '@/types/finance';
import { pageParams, problem } from './utils';

// ---------- Tài chính: tiện ích chung cho mock sổ tiền, đối soát, báo cáo ----------
// Handler chứng từ, phiếu chi, COD, hoàn tiền, khoản thu chưa khớp, giao dịch cổng đã gỡ theo commerio-backend#324 (FE#150).

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Danh sách tài chính của BE: trang 1–100, mặc định 20 */
export function financePage(url: URL) {
  const { page, pageSize } = pageParams(url);
  return { page, pageSize: Math.min(100, pageSize) };
}

export function listFilter(url: URL) {
  const q = (url.searchParams.get('search') ?? '').trim().toLowerCase();
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  return {
    matches: (...fields: (string | null | undefined)[]) => !q || fields.some((f) => f?.toLowerCase().includes(q)),
    /** `day` là yyyy-mm-dd theo giờ VN */
    inRange: (day: string) => (!from || day >= from) && (!to || day <= to),
    param: (name: string) => url.searchParams.get(name),
  };
}

export const findOrder = (orderId: string | null) => (orderId ? sales.orders.find((o) => o.id === orderId) : undefined);
export const customerOf = (o: sales.MockOrder) =>
  o.customerId ? sales.customers.find((c) => c.id === o.customerId) : undefined;

export function orderRef(orderId: string | null): OrderRef | null {
  const o = findOrder(orderId);
  return o ? { id: o.id, code: o.code, customerName: customerOf(o)?.name ?? null } : null;
}

export const docRef = (d: { id: string; number: string } | undefined): DocRef | null =>
  d ? { id: d.id, number: d.number } : null;

export const invalid = (errors: Record<string, string>) => problem(422, 'Dữ liệu không hợp lệ', { errors });

export const byDesc = <T>(key: (x: T) => string | null | undefined) => (a: T, b: T) =>
  (key(b) ?? '').localeCompare(key(a) ?? '');
