import { describe, expect, it } from 'vitest';
import {
  allLinesCancelled,
  cancelledAmountOf,
  completionBlockerText,
  isOverdue,
  orderCancelledBy,
  initiatorLabel,
  lineCancelEvents,
  lineCancelPending,
  lineDelivered,
  lineHasIssue,
  paymentMethodLabel,
  wardNote,
} from './shared';

describe('thông tin đơn sàn (FE#176)', () => {
  it('nhãn thanh toán: đơn tạo tay, giá trị gốc của sàn, giá trị lạ, chưa có', () => {
    const platform = (platformPaymentMethod: string | null) => paymentMethodLabel({ paymentMethod: null, platformPaymentMethod });
    expect(paymentMethodLabel({ paymentMethod: 'cod' })).toBe('COD');
    expect(paymentMethodLabel({ paymentMethod: 'prepaid', platformPaymentMethod: 'COD' })).toBe('Trả trước');
    expect(platform('COD')).toBe('COD');
    expect(platform('MIXEDCARD')).toBe('Thẻ');
    expect(platform('Lazada Wallet')).toBe('Ví của sàn');
    expect(platform('PAYLATER_X')).toBe('PAYLATER_X');
    expect(platform('toString')).toBe('toString');
    expect(platform(null)).toBe('Qua sàn');
    expect(paymentMethodLabel({ paymentMethod: null })).toBe('Qua sàn');
  });

  it('phường hiện riêng khi chuỗi địa chỉ chưa có; BE cũ chưa trả thì không', () => {
    expect(wardNote({ name: 'A', phone: '1', address: '6*** T***h', ward: 'Phường Tân Sơn Hòa' })).toBe('Phường Tân Sơn Hòa');
    expect(wardNote({ name: 'A', phone: '1', address: '6***, Phường Tân Sơn Hòa', ward: 'Phường Tân Sơn Hòa' })).toBeNull();
    expect(wardNote({ name: 'A', phone: '1', address: 'x' })).toBeNull();
  });

  it('ai huỷ', () => {
    expect(initiatorLabel('buyer')).toBe('người mua');
    expect(initiatorLabel('platform')).toBe('sàn');
  });

  it('dòng có huỷ/trả; trường thiếu thì không', () => {
    expect(lineHasIssue({})).toBe(false);
    expect(lineHasIssue({ returnStatus: 'Đang hoàn về' })).toBe(true);
    expect(lineHasIssue({ cancelKind: 'cancellation' })).toBe(true);
    expect(lineHasIssue({ cancelKind: 'failed_delivery' })).toBe(true);
  });

  it('dòng khách đang xin huỷ (DH-B04): chỉ khi đơn còn cờ xin huỷ, khách huỷ, kiểu huỷ hoặc chưa rõ', () => {
    const asking = { flags: ['cancel_requested'] };
    expect(lineCancelPending(asking, { cancelInitiator: 'buyer', cancelKind: 'cancellation' })).toBe(true);
    expect(lineCancelPending(asking, { cancelInitiator: 'buyer', cancelKind: null })).toBe(true);
    expect(lineCancelPending(asking, { cancelInitiator: 'buyer' })).toBe(true);
    // Đã trả lời (bỏ cờ) thì là huỷ thật
    expect(lineCancelPending({ flags: [] }, { cancelInitiator: 'buyer', cancelKind: 'cancellation' })).toBe(false);
    // Shop, sàn huỷ hoặc dòng trả hàng không phải xin huỷ
    expect(lineCancelPending(asking, { cancelInitiator: 'seller', cancelKind: 'cancellation' })).toBe(false);
    expect(lineCancelPending(asking, { cancelInitiator: 'platform', cancelKind: null })).toBe(false);
    expect(lineCancelPending(asking, { cancelInitiator: 'buyer', cancelKind: 'return' })).toBe(false);
    expect(lineCancelPending(asking, {})).toBe(false);
  });

  it('Lazada để trống người huỷ: món chưa huỷ có đơn ngược khi đơn còn cờ xin huỷ là khách xin huỷ (review PR FE#330)', () => {
    const asking = { flags: ['cancel_requested'] };
    expect(lineCancelPending(asking, { reverseOrderId: 'RO-1', cancelledQty: 0 })).toBe(true);
    // Món đã huỷ, hay đơn không còn cờ xin huỷ, hay đơn ngược loại trả: không phải xin huỷ
    expect(lineCancelPending(asking, { reverseOrderId: 'RO-1', cancelledQty: 1 })).toBe(false);
    expect(lineCancelPending({ flags: [] }, { reverseOrderId: 'RO-1' })).toBe(false);
    expect(lineCancelPending(asking, { reverseOrderId: 'RO-1', cancelKind: 'return' })).toBe(false);
  });

  it('món đã giao: nằm trong kiện Đã giao, khớp biến thể hoặc SKU', () => {
    const order = {
      packages: [
        { status: 'delivered', lines: [{ variantId: 'v1', sku: 'A' }, { variantId: null, sku: 'U' }] },
        { status: 'in_transit', lines: [{ variantId: 'v2', sku: 'B' }] },
      ],
    };
    expect(lineDelivered(order, { variantId: 'v1', sku: 'A' })).toBe(true);
    expect(lineDelivered(order, { variantId: null, sku: 'U' })).toBe(true);
    expect(lineDelivered(order, { variantId: 'v2', sku: 'B' })).toBe(false);
  });
});

describe('huỷ món: tiền và lịch sử (BE#417)', () => {
  const line = (id: string, unitPrice: number, extra: Partial<Parameters<typeof lineCancelEvents>[0][number]> = {}) => ({
    id,
    sku: id.toUpperCase(),
    productName: id === 'a' ? 'Áo' : 'Quần',
    quantity: 1,
    unitPrice,
    cancelledQty: 0,
    cancelledAt: null,
    cancelReason: null,
    cancelReasonDetail: null,
    cancelInitiator: null,
    ...extra,
  });

  it('huỷ lần lượt: mỗi lần một dòng lịch sử, tiền hàng còn lại giảm dần, cũ trước mới sau', () => {
    const lines = [
      line('b', 200000, { cancelledQty: 1, cancelledAt: '2026-11-19T01:00:00Z' }),
      line('a', 100000, { cancelledQty: 1, cancelledAt: '2026-11-18T07:20:00Z', cancelInitiator: 'buyer', cancelReason: 'Đổi ý' }),
    ];
    const events = lineCancelEvents(lines);
    expect(events.map((e) => [e.key, e.reason, e.remaining])).toEqual([
      ['a', 'Đổi ý', 200000],
      ['b', null, 0],
    ]);
    expect(events[0]!.title).toMatch(/^Người mua huỷ món Áo/);
    expect(events[1]!.title).toMatch(/^Sàn huỷ món Quần/);
    expect(allLinesCancelled(lines)).toBe(true);
    expect(cancelledAmountOf(lines)).toBe(300000);
  });

  it('huỷ một phần: chỉ món đã huỷ có dòng lịch sử; món huỷ trước BE#417 không có giờ', () => {
    const lines = [line('a', 100000, { cancelledQty: 1, cancelledAt: null }), line('b', 200000)];
    expect(lineCancelEvents(lines)).toMatchObject([{ key: 'a', at: null, remaining: 200000 }]);
    expect(allLinesCancelled(lines)).toBe(false);
    expect(cancelledAmountOf(lines)).toBe(100000);
  });
});

describe('chi tiết đơn: lý do chưa hoàn tất, người huỷ, trễ hạn (FE#282, FE#252)', () => {
  const fmt = (iso: string) => iso.slice(0, 10);

  it('câu đủ ý cho từng mã, hạn trả theo BE, mã lạ không hiện thô', () => {
    expect(completionBlockerText({ completionBlocker: null }, fmt)).toBeNull();
    expect(completionBlockerText({ completionBlocker: 'return_window', returnWindowEndsAt: '2026-11-25T00:00:00Z' }, fmt)).toBe(
      'Người mua còn quyền trả hàng tới 2026-11-25.',
    );
    expect(completionBlockerText({ completionBlocker: 'return_window', returnWindowEndsAt: null }, fmt)).toBe(
      'Sàn chưa báo hết quyền trả hàng của người mua.',
    );
    expect(completionBlockerText({ completionBlocker: 'packages_open' }, fmt)).toMatch(/^Còn kiện chưa xong/);
    expect(completionBlockerText({ completionBlocker: 'xyz_new' }, fmt)).toBe('Đơn còn việc chưa xong.');
  });

  it('người huỷ: dòng sàn trước, rồi lịch sử (người, sàn, hệ thống khi mọi kiện huỷ)', () => {
    const h = (by: { name: string } | null, source: string, reason: string | null = null) => [
      { to: 'processing', by: null, source: 'system' },
      { to: 'cancelled', by, source, reason },
    ];
    expect(orderCancelledBy({ status: 'cancelled', cancelInitiators: ['buyer'], statusHistory: [] })).toBe('người mua');
    expect(orderCancelledBy({ status: 'cancelled', statusHistory: h({ name: 'Sale A' }, 'user') })).toBe('Sale A');
    expect(orderCancelledBy({ status: 'cancelled', statusHistory: h(null, 'marketplace') })).toBe('Sàn');
    expect(orderCancelledBy({ status: 'cancelled', statusHistory: h(null, 'system', 'Mọi kiện đã huỷ') })).toBe(
      'Hệ thống (mọi kiện đã huỷ)',
    );
    expect(orderCancelledBy({ status: 'processing', statusHistory: h(null, 'system') })).toBeNull();
  });

  it('trễ hạn: có cờ Sắp trễ hạn và hạn gửi đã qua', () => {
    const now = Date.parse('2026-11-19T00:00:00Z');
    expect(isOverdue({ flags: ['due_soon'], shipBy: '2026-11-07T00:00:00Z' }, now)).toBe(true);
    expect(isOverdue({ flags: ['due_soon'], shipBy: '2026-11-19T12:00:00Z' }, now)).toBe(false);
    expect(isOverdue({ flags: [], shipBy: '2026-11-07T00:00:00Z' }, now)).toBe(false);
  });
});
