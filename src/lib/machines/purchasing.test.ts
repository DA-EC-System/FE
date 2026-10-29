import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@/utils/permissions';
import { goodsReceiptMachine, purchaseRequestMachine, supplierReturnMachine } from './purchasing';

const P = PERMISSIONS;
const muaHang = { accountId: 'acc-011', permissions: [P.purchaseRequestManage, P.supplierReturnManage] };
const kho = { accountId: 'acc-003', permissions: [P.goodsReceiptManage] };
const ceo = {
  accountId: 'acc-001',
  permissions: [P.purchaseRequestManage, P.purchaseRequestApprove, P.goodsReceiptManage, P.supplierReturnManage],
};
const actions = (list: { action: string }[]) => list.map((t) => t.action).sort();

describe('đề nghị nhập', () => {
  const rec = { createdBy: 'acc-011', lineCount: 2, activeLines: 2, receiptCount: 0, countingReceipts: 0 };

  it('người lập gửi duyệt, rút lại, huỷ; đề nghị trống không gửi được', () => {
    expect(actions(purchaseRequestMachine.available('draft', muaHang, rec))).toEqual(['cancel', 'submit']);
    expect(actions(purchaseRequestMachine.available('pending_approval', muaHang, rec))).toEqual(['cancel', 'withdraw']);
    expect(purchaseRequestMachine.check('draft', 'submit', { actor: muaHang, record: { ...rec, lineCount: 0 } })).toEqual({
      ok: false,
      code: 'empty_document',
    });
    expect(actions(purchaseRequestMachine.available('changes_requested', muaHang, rec))).toEqual(['cancel', 'resubmit']);
  });

  it('CEO duyệt, trả về, từ chối; người lập không tự duyệt', () => {
    expect(actions(purchaseRequestMachine.available('pending_approval', ceo, rec))).toEqual([
      'approve',
      'cancel',
      'reject',
      'request_changes',
      'withdraw',
    ]);
    const own = { ...rec, createdBy: 'acc-001' };
    expect(purchaseRequestMachine.check('pending_approval', 'approve', { actor: ceo, record: own })).toEqual({
      ok: false,
      code: 'second_person_required',
    });
    expect(purchaseRequestMachine.check('pending_approval', 'reject', { actor: ceo, record: rec })).toEqual({
      ok: false,
      code: 'reason_required',
    });
  });

  it('loại hết dòng thì không duyệt được', () => {
    expect(purchaseRequestMachine.check('pending_approval', 'approve', { actor: ceo, record: { ...rec, activeLines: 0 } })).toEqual({
      ok: false,
      code: 'all_lines_excluded',
    });
  });

  it('đã duyệt, đã đặt: chỉ CEO huỷ kèm lý do; có phiếu nhận thì bị chặn', () => {
    expect(actions(purchaseRequestMachine.available('ordered', muaHang, rec))).toEqual([]);
    expect(purchaseRequestMachine.check('ordered', 'cancel', { actor: ceo, record: rec, reason: 'NCC ngừng bán' })).toEqual({
      ok: true,
      to: 'cancelled',
    });
    expect(
      purchaseRequestMachine.check('ordered', 'cancel', { actor: ceo, record: { ...rec, receiptCount: 1 }, reason: 'x' }),
    ).toEqual({ ok: false, code: 'has_receipts' });
  });

  it('đóng thiếu bị chặn khi còn phiếu đang kiểm', () => {
    expect(
      purchaseRequestMachine.check('partially_received', 'close_short', {
        actor: ceo,
        record: { ...rec, countingReceipts: 1 },
        reason: 'NCC hết hàng',
      }),
    ).toEqual({ ok: false, code: 'receipt_counting' });
    expect(purchaseRequestMachine.check('partially_received', 'receive_all')).toEqual({ ok: true, to: 'received' });
  });
});

describe('phiếu nhận', () => {
  it('ghi sổ theo phần thiếu; người lập đề nghị không ghi sổ', () => {
    expect(actions(goodsReceiptMachine.available('counting', kho, { createdBy: 'acc-011', short: 0 }))).toEqual(['cancel', 'post']);
    expect(actions(goodsReceiptMachine.available('counting', kho, { createdBy: 'acc-011', short: 3 }))).toEqual([
      'cancel',
      'post_short',
    ]);
    expect(goodsReceiptMachine.check('counting', 'post', { actor: ceo, record: { createdBy: 'acc-001', short: 0 } })).toEqual({
      ok: false,
      code: 'second_person_required',
    });
  });

  it('giao thiếu chỉ hệ thống chuyển sang đã xử lý', () => {
    expect(goodsReceiptMachine.available('short', ceo, { createdBy: 'acc-011', short: 3 })).toEqual([]);
    expect(goodsReceiptMachine.isFinal('resolved')).toBe(true);
  });
});

describe('phiếu trả NCC', () => {
  const rec = { createdBy: null, lineCount: 1, hasSupplier: true };

  it('chưa chọn NCC thì không gửi duyệt được', () => {
    expect(supplierReturnMachine.check('draft', 'submit', { actor: muaHang, record: { ...rec, hasSupplier: false } })).toEqual({
      ok: false,
      code: 'supplier_required',
    });
  });

  it('CEO trả về hoặc duyệt và gửi; huỷ cần lý do', () => {
    expect(actions(supplierReturnMachine.available('pending_approval', ceo, rec))).toEqual(['approve_send', 'cancel', 'send_back']);
    expect(actions(supplierReturnMachine.available('draft', muaHang, rec))).toEqual(['submit']);
  });

  it('người gửi không tự ghi kết quả', () => {
    const sent = { ...rec, createdBy: 'acc-001' };
    expect(supplierReturnMachine.available('sent', ceo, sent)).toEqual([]);
    expect(actions(supplierReturnMachine.available('sent', muaHang, sent))).toEqual([
      'record_refund',
      'record_rejected',
      'record_replaced',
    ]);
  });
});
