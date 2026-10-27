import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@/utils/permissions';
import {
  cancelPlan,
  completionBlocker,
  isDueSoon,
  orderMachine,
  outcomeOf,
  packageMachine,
  platformUpdate,
  stageOf,
  stockEffect,
  type OrderRecord,
  type PackageRecord,
} from './order';
import type { PackageStatus } from '@/types/fulfillment';

const P = PERMISSIONS;
const kho = { accountId: 'kho', permissions: [P.fulfillmentProcess] };
const kho2 = { accountId: 'kho2', permissions: [P.fulfillmentProcess] };
const sale = { accountId: 'sale', permissions: [P.orderCreate, P.orderCancel, P.deliveryUpdate] };
const ceo = { accountId: 'ceo', permissions: [P.handoverRevert, P.fulfillmentProcess] };

const manual: PackageRecord = { source: 'manual', selfDelivery: false, orderStatus: 'processing' };
const market: PackageRecord = { source: 'marketplace', selfDelivery: false, orderStatus: 'processing' };
const self: PackageRecord = { source: 'inbox', selfDelivery: true, orderStatus: 'processing' };

describe('Kiện (sơ đồ D2)', () => {
  it('đi hết đường chính: đóng gói, báo sàn, bàn giao, giao', () => {
    expect(packageMachine.check('reserved', 'pack', { actor: kho, record: manual })).toEqual({ ok: true, to: 'packed' });
    expect(packageMachine.check('packed', 'mark_ready', { actor: kho, record: manual })).toEqual({ ok: true, to: 'awaiting_pickup' });
    expect(packageMachine.check('awaiting_pickup', 'hand_over', { actor: kho, record: manual })).toEqual({ ok: true, to: 'in_transit' });
    expect(packageMachine.check('in_transit', 'deliver', { actor: sale, record: manual })).toEqual({ ok: true, to: 'delivered' });
  });

  it('chưa đóng gói khi đơn chưa thanh toán', () => {
    expect(packageMachine.check('reserved', 'pack', { actor: kho, record: { ...manual, orderStatus: 'unpaid' } })).toEqual({
      ok: false,
      code: 'order_not_processing',
    });
  });

  it('thiếu hàng không đóng gói được, giữ đủ là do hệ thống', () => {
    expect(packageMachine.check('backordered', 'pack', { actor: kho, record: manual }).ok).toBe(false);
    expect(packageMachine.available('backordered', kho, manual)).toEqual([]);
  });

  it('đảo bàn giao chỉ CEO, bắt buộc lý do', () => {
    expect(packageMachine.check('in_transit', 'undo_handover', { actor: kho, record: manual, reason: 'x' })).toEqual({
      ok: false,
      code: 'forbidden',
    });
    expect(packageMachine.check('in_transit', 'undo_handover', { actor: ceo, record: manual })).toEqual({
      ok: false,
      code: 'reason_required',
    });
    expect(packageMachine.check('in_transit', 'undo_handover', { actor: ceo, record: manual, reason: 'Quét nhầm' })).toEqual({
      ok: true,
      to: 'awaiting_pickup',
    });
  });

  it('mở kiện đã đóng: về Đã giữ hoặc huỷ; kiện đã bàn giao không mở được', () => {
    expect(packageMachine.check('awaiting_pickup', 'open', { actor: kho, record: manual })).toEqual({ ok: true, to: 'reserved' });
    expect(packageMachine.check('packed', 'open_cancel', { actor: kho, record: manual })).toEqual({ ok: true, to: 'cancelled' });
    expect(packageMachine.check('in_transit', 'open', { actor: kho, record: manual }).ok).toBe(false);
  });

  it('đơn sàn: người dùng không cập nhật giao, sàn thì được', () => {
    expect(packageMachine.check('in_transit', 'deliver', { actor: sale, record: market })).toEqual({
      ok: false,
      code: 'not_allowed_for_source',
    });
    expect(packageMachine.check('in_transit', 'deliver', { record: { ...market, byPlatform: true } })).toEqual({
      ok: true,
      to: 'delivered',
    });
  });

  it('tự giao chỉ với kiện tự giao, giao lại theo cách giao ban đầu', () => {
    expect(packageMachine.check('packed', 'self_deliver', { actor: sale, record: self })).toEqual({ ok: true, to: 'self_delivering' });
    expect(packageMachine.check('packed', 'self_deliver', { actor: sale, record: manual })).toEqual({
      ok: false,
      code: 'carrier_delivery',
    });
    expect(packageMachine.check('delivery_failed', 'redeliver', { actor: sale, record: self }).ok).toBe(false);
    expect(packageMachine.check('delivery_failed', 'redeliver_self', { actor: sale, record: self })).toEqual({
      ok: true,
      to: 'self_delivering',
    });
  });

  it('thất lạc: mã khiếu nại và người thứ hai', () => {
    const reported = { ...manual, createdBy: 'kho' };
    expect(packageMachine.check('in_transit', 'lose', { actor: kho, record: reported, reason: 'KN-1' })).toEqual({
      ok: false,
      code: 'second_person_required',
    });
    expect(packageMachine.check('in_transit', 'lose', { actor: kho2, record: reported })).toEqual({
      ok: false,
      code: 'reason_required',
    });
    expect(packageMachine.check('in_transit', 'lose', { actor: kho2, record: reported, reason: 'KN-1' })).toEqual({
      ok: true,
      to: 'lost',
    });
    expect(packageMachine.check('lost', 'found', { actor: kho, record: manual })).toEqual({ ok: true, to: 'returned' });
  });

  it('sàn đẩy cập nhật: có mũi tên thì áp, nhảy tới trên đường chính thì bù, còn lại cần xử lý', () => {
    expect(platformUpdate('in_transit', 'delivered')).toBe('direct');
    expect(platformUpdate('packed', 'delivered')).toBe('jump');
    expect(platformUpdate('reserved', 'in_transit')).toBe('jump');
    expect(platformUpdate('delivered', 'in_transit')).toBe('invalid');
    expect(platformUpdate('cancelled', 'delivered')).toBe('invalid');
  });

  it('tồn thực trừ khi rời kho, cộng lại khi đảo bàn giao', () => {
    expect(stockEffect('awaiting_pickup', 'in_transit')).toBe('leave');
    expect(stockEffect('packed', 'delivered')).toBe('leave');
    expect(stockEffect('in_transit', 'awaiting_pickup')).toBe('back');
    expect(stockEffect('in_transit', 'delivered')).toBeNull();
    expect(stockEffect('returning', 'returned')).toBeNull();
  });
});

describe('Đơn bán (sơ đồ D1)', () => {
  const rec = (packages: PackageStatus[], extra: Partial<OrderRecord> = {}): OrderRecord => ({
    source: 'manual',
    paymentMethod: 'cod',
    packages,
    ...extra,
  });

  it('xác nhận đơn COD tạo tay; trả trước chờ khách trả; đơn sàn tự sang', () => {
    expect(orderMachine.check('unpaid', 'confirm', { actor: sale, record: rec(['reserved']) })).toEqual({
      ok: true,
      to: 'processing',
    });
    expect(
      orderMachine.check('unpaid', 'confirm', { actor: sale, record: rec(['reserved'], { paymentMethod: 'prepaid' }) }),
    ).toEqual({ ok: false, code: 'payment_required' });
    expect(
      orderMachine.check('unpaid', 'confirm', { actor: sale, record: rec(['reserved'], { source: 'marketplace' }) }),
    ).toEqual({ ok: false, code: 'not_allowed_for_source' });
  });

  it('huỷ: cần lý do, chặn khi đã có kiện bàn giao', () => {
    expect(orderMachine.check('processing', 'cancel', { actor: sale, record: rec(['reserved']) })).toEqual({
      ok: false,
      code: 'reason_required',
    });
    expect(orderMachine.check('processing', 'cancel', { actor: sale, record: rec(['delivered', 'reserved']), reason: 'x' })).toEqual({
      ok: false,
      code: 'already_handed_over',
    });
    expect(orderMachine.check('processing', 'cancel', { actor: sale, record: rec(['packed']), reason: 'Khách đổi ý' })).toEqual({
      ok: true,
      to: 'cancelled',
    });
  });

  it('huỷ khi còn kiện đã đóng gói thì chờ mở kiện', () => {
    expect(cancelPlan(['reserved', 'backordered'])).toBe('now');
    expect(cancelPlan(['reserved', 'awaiting_pickup'])).toBe('after_open');
  });

  it('hoàn tất khi mọi kiện dừng, hết hạn trả, không còn yêu cầu trả, COD tự giao đã xác nhận', () => {
    const now = Date.parse('2026-10-20T00:00:00Z');
    const base = { packages: ['delivered'] as const, lastDeliveredAt: '2026-10-10T00:00:00Z', openReturnRequests: 0, codUnconfirmed: false, now };
    expect(completionBlocker(base)).toBeNull();
    expect(completionBlocker({ ...base, packages: ['delivered', 'in_transit'] })).toBe('packages_open');
    expect(completionBlocker({ ...base, lastDeliveredAt: '2026-10-18T00:00:00Z' })).toBe('return_window');
    expect(completionBlocker({ ...base, openReturnRequests: 1 })).toBe('return_requested');
    expect(completionBlocker({ ...base, codUnconfirmed: true })).toBe('cod_unconfirmed');
    expect(completionBlocker({ ...base, packages: ['returned'], lastDeliveredAt: null })).toBeNull();
  });

  it('kết quả: giao đủ, giao một phần, không giao được (bỏ kiện huỷ)', () => {
    expect(outcomeOf(['delivered', 'cancelled'])).toBe('full');
    expect(outcomeOf(['delivered', 'returned'])).toBe('partial');
    expect(outcomeOf(['lost', 'returned'])).toBe('none');
  });

  it('giai đoạn hiển thị: nhánh lỗi trước, rồi kiện chậm nhất', () => {
    const base = { status: 'processing' as const, source: 'manual' as const, paymentMethod: 'cod' as const, flags: [] };
    expect(stageOf({ ...base, packages: ['delivered', 'in_transit'] })).toBe('in_transit');
    expect(stageOf({ ...base, packages: ['delivered', 'packed', 'backordered'] })).toBe('backordered');
    expect(stageOf({ ...base, packages: ['delivered', 'delivery_failed', 'reserved'] })).toBe('delivery_failed');
    expect(stageOf({ ...base, packages: ['delivered', 'returned'] })).toBe('awaiting_completion');
    expect(stageOf({ ...base, packages: ['packed'], flags: ['cancelling'] })).toBe('cancelling');
    expect(stageOf({ ...base, status: 'unpaid', packages: ['reserved'] })).toBe('awaiting_confirmation');
    expect(stageOf({ ...base, status: 'unpaid', paymentMethod: 'prepaid', packages: ['reserved'] })).toBe('awaiting_payment');
  });

  it('sắp trễ hạn khi còn kiện chưa rời kho', () => {
    const now = Date.parse('2026-10-20T00:00:00Z');
    expect(isDueSoon('2026-10-20T12:00:00Z', ['reserved'], now)).toBe(true);
    expect(isDueSoon('2026-10-20T12:00:00Z', ['in_transit'], now)).toBe(false);
    expect(isDueSoon('2026-10-25T00:00:00Z', ['reserved'], now)).toBe(false);
    expect(isDueSoon(null, ['reserved'], now)).toBe(false);
  });
});
