import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@/utils/permissions';
import { isOpenReturn, isRefunded, returnMachine } from './returns';

const sale = { accountId: 'a1', permissions: [PERMISSIONS.returnView, PERMISSIONS.returnProcess] };
const kho = { accountId: 'a2', permissions: [PERMISSIONS.returnView, PERMISSIONS.fulfillmentProcess] };
const shopee = { source: 'marketplace' as const };
const manual = { source: 'manual' as const };

describe('Yêu cầu trả (sơ đồ D3)', () => {
  it('đi đúng các mũi tên của sơ đồ', () => {
    expect(returnMachine.check('requested', 'accept', { actor: sale, record: manual })).toEqual({ ok: true, to: 'awaiting_return' });
    expect(returnMachine.check('requested', 'refund_only', { actor: sale, record: manual })).toEqual({ ok: true, to: 'refund_only' });
    expect(returnMachine.check('awaiting_return', 'receive', { actor: kho, record: manual })).toEqual({ ok: true, to: 'received' });
    expect(returnMachine.check('received', 'close', { record: manual })).toEqual({ ok: true, to: 'closed' });
    expect(returnMachine.check('awaiting_return', 'no_show', { actor: sale, record: manual, reason: 'Quá hạn gửi' })).toEqual({
      ok: true,
      to: 'closed',
    });
  });

  it('từ chối và khách không gửi bắt buộc lý do', () => {
    expect(returnMachine.check('requested', 'reject', { actor: sale, record: manual })).toEqual({ ok: false, code: 'reason_required' });
    expect(returnMachine.check('awaiting_return', 'no_show', { actor: sale, record: manual })).toEqual({
      ok: false,
      code: 'reason_required',
    });
  });

  it('sàn xử cho khách mở lại yêu cầu bị từ chối, chỉ với yêu cầu từ sàn', () => {
    expect(returnMachine.check('rejected', 'platform_reopen', { actor: sale, record: shopee })).toEqual({ ok: true, to: 'awaiting_return' });
    expect(returnMachine.check('rejected', 'platform_refund', { actor: sale, record: shopee })).toEqual({ ok: true, to: 'refund_only' });
    expect(returnMachine.check('rejected', 'platform_reopen', { actor: sale, record: manual })).toEqual({ ok: false, code: 'not_marketplace' });
    expect(returnMachine.available('rejected', sale, manual)).toEqual([]);
  });

  it('kho chỉ nhận hàng, Sale không nhận hàng', () => {
    expect(returnMachine.available('requested', kho, manual)).toEqual([]);
    expect(returnMachine.available('awaiting_return', kho, manual).map((t) => t.action)).toEqual(['receive']);
    expect(returnMachine.available('awaiting_return', sale, manual).map((t) => t.action)).toEqual(['no_show']);
  });

  it('đóng do kiểm hàng về và khách rút là của hệ thống, không hiện nút', () => {
    expect(returnMachine.available('received', sale, manual)).toEqual([]);
    expect(returnMachine.check('requested', 'buyer_cancel', { record: shopee })).toEqual({ ok: true, to: 'closed' });
    expect(returnMachine.check('received', 'buyer_cancel', { record: shopee })).toEqual({ ok: false, code: 'invalid_transition' });
  });

  it('trạng thái kết thúc và yêu cầu còn mở', () => {
    expect(returnMachine.isFinal('closed')).toBe(true);
    expect(returnMachine.isFinal('refund_only')).toBe(true);
    expect(returnMachine.isFinal('rejected')).toBe(false);
    expect(['requested', 'awaiting_return', 'received'].every((s) => isOpenReturn(s as never))).toBe(true);
    expect(isOpenReturn('rejected')).toBe(false);
  });

  it('đã hoàn tiền khi chỉ hoàn tiền hoặc đã nhận hàng', () => {
    expect(isRefunded('refund_only', null)).toBe(true);
    expect(isRefunded('received', null)).toBe(true);
    expect(isRefunded('closed', 'inspected')).toBe(true);
    expect(isRefunded('closed', 'no_show')).toBe(false);
    expect(isRefunded('awaiting_return', null)).toBe(false);
  });
});
