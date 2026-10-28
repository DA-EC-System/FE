import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@/utils/permissions';
import type { PackageSummary } from '@/types/fulfillment';
import { handoverFailureLabel, packageButtons } from './shared';

const P = PERMISSIONS;
const kho = { accountId: 'kho', permissions: [P.fulfillmentProcess] };
const sale = { accountId: 'sale', permissions: [P.deliveryUpdate, P.orderView] };
const ceo = { accountId: 'ceo', permissions: [P.fulfillmentProcess, P.deliveryUpdate, P.handoverRevert] };

const pkg = (patch: Partial<PackageSummary> = {}): PackageSummary => ({
  id: 'pkg-1',
  code: 'KH-000001',
  order: { id: 'ord-1', code: 'DH-1', status: 'processing' },
  source: 'manual',
  shop: null,
  customerName: 'An',
  status: 'reserved',
  flags: [],
  flagNote: null,
  openPurpose: null,
  selfDelivery: false,
  paymentMethod: 'cod',
  paymentStatus: 'cod_pending',
  trackingCode: null,
  platformPackageCode: null,
  carrier: null,
  shipBy: null,
  lines: [],
  totalQty: 1,
  handedOverAt: null,
  deliveredAt: null,
  deliveredBy: null,
  lostReport: null,
  createdAt: '2026-10-20T00:00:00Z',
  version: 1,
  ...patch,
});

describe('packageButtons (sơ đồ D2)', () => {
  it('kho đóng gói kiện đã giữ của đơn đang xử lý; đơn chưa thanh toán thì chưa', () => {
    expect(packageButtons(pkg(), kho).actions).toEqual(['pack']);
    expect(packageButtons(pkg({ order: { id: 'o', code: 'DH', status: 'unpaid' } }), kho).actions).toEqual([]);
  });

  it('kiện đã đóng gói: báo sàn sẵn sàng hoặc mở; kiện tự giao thì tự giao', () => {
    expect(packageButtons(pkg({ status: 'packed' }), kho).actions).toEqual(['mark_ready', 'open']);
    expect(packageButtons(pkg({ status: 'packed', selfDelivery: true }), ceo).actions).toEqual(['open', 'self_deliver']);
  });

  it('kiện chờ mở vì đơn huỷ chỉ có Mở kiện, huỷ', () => {
    const p = pkg({ status: 'awaiting_pickup', flags: ['needs_open'], openPurpose: 'cancel' });
    expect(packageButtons(p, kho).actions).toEqual(['hand_over', 'open_cancel']);
  });

  it('đang giao: sale cập nhật giao, CEO đảo bàn giao, kho báo thất lạc', () => {
    const p = pkg({ status: 'in_transit' });
    expect(packageButtons(p, sale).actions).toEqual(['deliver', 'fail', 'return']);
    expect(packageButtons(p, ceo).actions).toContain('undo_handover');
    expect(packageButtons(p, kho)).toMatchObject({ actions: [], reportLost: true });
  });

  it('đơn sàn đang giao: không nút giao, có ghi chú', () => {
    const b = packageButtons(pkg({ status: 'in_transit', source: 'marketplace' }), sale);
    expect(b.actions).toEqual([]);
    expect(b.note).toBe('Trạng thái giao lấy từ sàn.');
  });

  it('báo thất lạc rồi: người báo không tự xác nhận, người khác thì được', () => {
    const p = pkg({ status: 'in_transit', lostReport: { by: { id: 'kho', name: 'Kho' }, at: '', claimCode: 'KN-1' } });
    expect(packageButtons(p, kho)).toMatchObject({ actions: [], reportLost: false });
    expect(packageButtons(p, { ...kho, accountId: 'kho2' }).actions).toEqual(['lose']);
  });
});

describe('handoverFailureLabel', () => {
  it('nhãn theo mã, mã lạ có nhãn chung', () => {
    expect(handoverFailureLabel('version_conflict')).toBe('Kiện vừa được cập nhật');
    expect(handoverFailureLabel('xyz')).toBe('Không bàn giao được');
  });
});
