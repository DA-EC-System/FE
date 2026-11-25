import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@/utils/permissions';
import type { PackageSummary } from '@/types/fulfillment';
import {
  OPEN_PURPOSE_LABELS,
  canPrintLabel,
  handoverFailureLabel,
  isHotPackage,
  openPurposeLabel,
  packageBackTo,
  packageButtons,
  pendingDropTotal,
  remapOpenNote,
} from './shared';

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

  it('kiện chờ mở vì đơn huỷ chỉ có Mở kiện, huỷ; không bàn giao được (awaiting_open)', () => {
    const p = pkg({ status: 'awaiting_pickup', flags: ['needs_open'], openPurpose: 'cancel' });
    expect(packageButtons(p, kho).actions).toEqual(['open_cancel']);
    expect(packageButtons(p, kho).blocked).toMatch(/chờ mở/);
  });

  it('Chờ lấy hàng chờ mở vì sàn chia lại hay kiểm kê thiếu: Mở kiện, báo mất được (commerio-backend#238)', () => {
    for (const openPurpose of ['resplit', 'stocktake'] as const) {
      const p = pkg({ status: 'awaiting_pickup', source: 'marketplace', flags: ['needs_open'], openPurpose });
      expect(packageButtons(p, kho)).toMatchObject({ actions: ['open'], reportLost: true });
    }
    // Không chờ mở: không mở, không báo mất
    expect(packageButtons(pkg({ status: 'awaiting_pickup', source: 'marketplace' }), kho)).toMatchObject({
      actions: ['hand_over'],
      reportLost: false,
    });
  });

  it('kiện thay chờ mở kiện cũ: ẩn Báo sẵn sàng, ghi mã kiện cũ', () => {
    const p = pkg({ status: 'packed', replaces: { id: 'pkg-0', code: 'KH-000000', status: 'awaiting_pickup' } });
    const b = packageButtons(p, kho);
    expect(b.actions).toEqual(['open']);
    expect(b.blocked).toContain('KH-000000');
    const done = pkg({ status: 'packed', replaces: { id: 'pkg-0', code: 'KH-000000', status: 'cancelled' } });
    expect(packageButtons(done, kho)).toMatchObject({ actions: ['mark_ready', 'open'], blocked: null });
  });

  it('dỡ kiện không thấy: người khác xác nhận lose_on_unload', () => {
    const p = pkg({
      status: 'awaiting_pickup',
      source: 'marketplace',
      flags: ['needs_open', 'lost_reported'],
      openPurpose: 'resplit',
      lostReport: { by: { id: 'kho', name: 'Kho' }, at: '', claimCode: 'Không thấy trên kệ' },
    });
    expect(packageButtons(p, { ...kho, accountId: 'kho2' }).actions).toContain('lose_on_unload');
    expect(packageButtons(p, kho).actions).not.toContain('lose_on_unload');
    expect(packageButtons(p, kho).lostNote).toMatch(/người khác/);
  });

  it('đang giao: sale cập nhật giao, CEO đảo bàn giao, kho báo thất lạc', () => {
    const p = pkg({ status: 'in_transit' });
    expect(packageButtons(p, sale).actions).toEqual(['deliver', 'fail', 'return']);
    expect(packageButtons(p, ceo).actions).toContain('undo_handover');
    expect(packageButtons(p, kho)).toMatchObject({ actions: [], reportLost: true });
  });

  it('Đảo bàn giao chỉ hiện với kiện kho quét mà sàn chưa xác nhận lấy (21 §19.2)', () => {
    const shipping = { status: 'in_transit' as const, source: 'marketplace' as const };
    expect(packageButtons(pkg({ ...shipping, handoverSource: 'scan', pickupConfirmedAt: null }), ceo).actions).toContain('undo_handover');
    expect(packageButtons(pkg({ ...shipping, handoverSource: 'scan', pickupConfirmedAt: '2026-11-18T05:00:00Z' }), ceo).actions).not.toContain(
      'undo_handover',
    );
    expect(packageButtons(pkg({ ...shipping, handoverSource: 'marketplace', pickupConfirmedAt: '2026-11-18T05:00:00Z' }), ceo).actions).not.toContain(
      'undo_handover',
    );
    expect(packageButtons(pkg({ ...shipping, handoverSource: 'forced', pickupConfirmedAt: null }), ceo).actions).not.toContain('undo_handover');
  });

  it('đơn sàn đang giao: không nút giao, có ghi chú', () => {
    const b = packageButtons(pkg({ status: 'in_transit', source: 'marketplace' }), sale);
    expect(b.actions).toEqual([]);
    expect(b.note).toBe('Trạng thái giao hàng cập nhật tự động từ sàn.');
  });

  it('báo thất lạc rồi: người báo không tự xác nhận, người khác thì được', () => {
    const p = pkg({ status: 'in_transit', lostReport: { by: { id: 'kho', name: 'Kho' }, at: '', claimCode: 'KN-1' } });
    expect(packageButtons(p, kho)).toMatchObject({ actions: [], reportLost: false });
    expect(packageButtons(p, { ...kho, accountId: 'kho2' }).actions).toEqual(['lose']);
    expect(packageButtons(p, { ...kho, canSelfApprove: true })).toMatchObject({
      actions: ['lose'],
      lostNote: 'Bạn là người báo. Xác nhận sẽ ghi là tự duyệt.',
    });
  });

  it('người tự giao không xác nhận kiện mình giao bị mất (D13)', () => {
    const p = pkg({
      status: 'self_delivering',
      selfDelivery: true,
      deliveredBy: { id: 'kho2', name: 'Kho 2' },
      lostReport: { by: { id: 'kho', name: 'Kho' }, at: '', claimCode: 'KN-1' },
    });
    expect(packageButtons(p, { ...kho, accountId: 'kho2' }).actions).not.toContain('lose');
    expect(packageButtons(p, { ...kho, accountId: 'kho3' }).actions).toContain('lose');
  });
});

describe('handoverFailureLabel', () => {
  it('nhãn theo mã, mã lạ có nhãn chung', () => {
    expect(handoverFailureLabel('version_conflict')).toBe('Kiện vừa có người sửa, tải lại rồi thử lại');
    expect(handoverFailureLabel('xyz')).toBe('Không bàn giao được');
  });
});

describe('isHotPackage (FE#139)', () => {
  const now = Date.parse('2026-11-11T08:00:00Z');
  const at = (h: number) => new Date(now + h * 3600 * 1000).toISOString();

  it('kiện chưa rời kho, hạn bàn giao đã qua hoặc còn dưới 24 giờ thì gấp', () => {
    expect(isHotPackage({ status: 'reserved', shipBy: at(5) }, now)).toBe(true);
    expect(isHotPackage({ status: 'awaiting_pickup', shipBy: at(-2) }, now)).toBe(true);
    expect(isHotPackage({ status: 'packed', shipBy: at(30) }, now)).toBe(false);
  });

  it('kiện đã giao đi hoặc không có hạn thì không gấp', () => {
    expect(isHotPackage({ status: 'in_transit', shipBy: at(-2) }, now)).toBe(false);
    expect(isHotPackage({ status: 'reserved', shipBy: null }, now)).toBe(false);
  });
});

describe('packageBackTo', () => {
  it('đọc nơi quay về hợp lệ, bỏ state thiếu hoặc sai kiểu', () => {
    expect(packageBackTo({ backTo: { path: '/c/1/sales/orders/2', label: 'Về đơn DH1' } })).toEqual({
      path: '/c/1/sales/orders/2',
      label: 'Về đơn DH1',
    });
    expect(packageBackTo(null)).toBeNull();
    expect(packageBackTo({ backTo: { path: 1, label: 'x' } })).toBeNull();
  });
});

describe('pendingDropTotal (21 §19.2)', () => {
  it('cộng phần chờ bỏ của mọi dòng, 0 khi không dòng nào chờ bỏ', () => {
    expect(pendingDropTotal([])).toBe(0);
    expect(pendingDropTotal([{ pendingDropQty: 0 }, { pendingDropQty: 0 }])).toBe(0);
    expect(pendingDropTotal([{ pendingDropQty: 2 }, { pendingDropQty: 0 }, { pendingDropQty: 1 }])).toBe(3);
  });
});

describe('báo sàn, in vận đơn (commerio-backend#239, FE#338)', () => {
  const san = (patch: Partial<PackageSummary> = {}) =>
    pkg({ source: 'marketplace', status: 'packed', platformPackageCode: 'FP1', ...patch });

  it('KH-B07: đơn khách đang xin huỷ thì ẩn Báo sàn sẵn sàng và nói lý do', () => {
    const b = packageButtons(san({ flags: ['cancel_requested'] }), kho);
    expect(b.actions).not.toContain('mark_ready');
    expect(b.blocked).toContain('Người mua đang xin huỷ');
    expect(packageButtons(san(), kho).actions).toContain('mark_ready');
  });

  it('TRA-B06: kiện đơn sàn chưa có mã kiện sàn thì ẩn Báo sàn sẵn sàng, chỉ cách Kéo đơn ngay', () => {
    const b = packageButtons(san({ platformPackageCode: null }), kho);
    expect(b.actions).not.toContain('mark_ready');
    expect(b.blocked).toContain('Kéo đơn ngay');
    expect(packageButtons(pkg({ status: 'packed' }), kho).actions).toContain('mark_ready');
  });

  it('KH-B03: in được khi sàn đã cấp mã kiện và mã vận đơn, trước khi bàn giao', () => {
    expect(canPrintLabel(san({ trackingCode: 'JNT1' }))).toBe(true);
    expect(canPrintLabel(san({ status: 'awaiting_pickup', trackingCode: 'TT1' }))).toBe(true);
    expect(canPrintLabel(san({ trackingCode: null }))).toBe(false);
    expect(canPrintLabel(san({ platformPackageCode: null, trackingCode: 'JNT1' }))).toBe(false);
    expect(canPrintLabel(san({ status: 'in_transit', trackingCode: 'JNT1' }))).toBe(false);
  });
});

describe('mục đích remap: đổi liên kết SKU khi kiện đã đóng (commerio-backend#237 PR 2, FE#359)', () => {
  it('nhãn Đổi liên kết SKU', () => {
    expect(OPEN_PURPOSE_LABELS.remap).toBe('Đổi liên kết SKU');
  });

  it('openPurposeLabel chỉ có khi kiện chờ mở và có mục đích', () => {
    expect(openPurposeLabel({ flags: ['needs_open'], openPurpose: 'remap' })).toBe('Đổi liên kết SKU');
    expect(openPurposeLabel({ flags: [], openPurpose: 'remap' })).toBeNull();
    expect(openPurposeLabel({ flags: ['needs_open'], openPurpose: null })).toBeNull();
  });

  it('kiện đã đóng chờ mở vì đổi liên kết: chỉ Mở kiện, không báo sẵn sàng, không bàn giao', () => {
    for (const status of ['packed', 'awaiting_pickup'] as const) {
      const p = pkg({ status, source: 'marketplace', platformPackageCode: 'PK-1', flags: ['needs_open'], openPurpose: 'remap' });
      const b = packageButtons(p, kho);
      expect(b.actions).toContain('open');
      expect(b.actions).not.toContain('open_cancel');
      expect(b.actions).not.toContain('mark_ready');
      expect(b.actions).not.toContain('hand_over');
      expect(b.blocked).toMatch(/Kiện đang chờ mở/);
    }
  });

  it('hộp xác nhận Mở kiện báo áp liên kết mới và có thể về Thiếu hàng khi còn dòng remapPending', () => {
    expect(remapOpenNote({ lines: [{ remapPending: false }, { remapPending: true }] })).toBe(
      ' Mở ra sẽ áp liên kết SKU mới: lấy món cũ ra, nhặt món theo SKU mới. SKU mới thiếu hàng thì kiện về Thiếu hàng.',
    );
    expect(remapOpenNote({ lines: [{ remapPending: false }] })).toBe('');
  });
});
