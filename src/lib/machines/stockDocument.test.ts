import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@/utils/permissions';
import { adjustmentMachine, inspectionMachine, stockDocMachine } from './stockDocument';

const kho = { accountId: 'acc-003', permissions: [PERMISSIONS.stockDocManage] };
const kho2 = { accountId: 'acc-009', permissions: [PERMISSIONS.stockDocManage] };
const ceo = { accountId: 'acc-001', permissions: [PERMISSIONS.stockDocManage, PERMISSIONS.stockDocApprove] };
const actions = (list: { action: string }[]) => list.map((t) => t.action).sort();

describe('phiếu điều chỉnh (kiểm kê, xuất huỷ, chuyển chờ xử lý)', () => {
  const rec = { createdBy: 'acc-003', lineCount: 1, missing: 0 };

  it('kho gửi duyệt hoặc huỷ nháp; phiếu trống không gửi được', () => {
    expect(actions(adjustmentMachine.available('draft', kho, rec))).toEqual(['cancel', 'submit']);
    expect(adjustmentMachine.check('draft', 'submit', { actor: kho, record: { ...rec, lineCount: 0 } })).toEqual({
      ok: false,
      code: 'empty_document',
    });
  });

  it('chỉ CEO duyệt; từ chối cần lý do', () => {
    expect(adjustmentMachine.available('pending', kho, rec)).toEqual([]);
    expect(actions(adjustmentMachine.available('pending', ceo, rec))).toEqual(['approve', 'reject']);
    expect(adjustmentMachine.check('pending', 'reject', { actor: ceo, record: rec })).toEqual({
      ok: false,
      code: 'reason_required',
    });
    expect(adjustmentMachine.check('pending', 'reject', { actor: ceo, record: rec, reason: 'Đếm sai' })).toEqual({
      ok: true,
      to: 'rejected',
    });
  });

  it('ghi sổ, từ chối, huỷ là trạng thái kết thúc', () => {
    expect(['posted', 'rejected', 'cancelled'].every((s) => adjustmentMachine.isFinal(s as 'posted'))).toBe(true);
  });
});

describe('kiểm hàng về', () => {
  const full = { createdBy: 'acc-003', lineCount: 2, missing: 0 };
  const short = { ...full, missing: 1 };

  it('không thiếu thì ghi sổ thẳng, có thiếu thì gửi duyệt', () => {
    expect(actions(inspectionMachine.available('draft', kho, full))).toEqual(['post']);
    expect(actions(inspectionMachine.available('draft', kho, short))).toEqual(['submit']);
    expect(inspectionMachine.check('draft', 'post', { actor: kho, record: short })).toEqual({
      ok: false,
      code: 'shortage_needs_review',
    });
  });

  it('người quét không tự duyệt phần thiếu; kho khác hoặc CEO duyệt được', () => {
    expect(inspectionMachine.available('pending', kho, short)).toEqual([]);
    expect(actions(inspectionMachine.available('pending', kho2, short))).toEqual(['approve', 'reject']);
    expect(actions(inspectionMachine.available('pending', ceo, short))).toEqual(['approve', 'reject']);
  });

  it('yêu cầu kiểm lại đưa phiếu về nháp', () => {
    expect(inspectionMachine.check('pending', 'reject', { actor: kho2, record: short, reason: 'Quét lại' })).toEqual({
      ok: true,
      to: 'draft',
    });
  });
});

it('phiếu nhập, xuất theo đơn không có nút', () => {
  expect(stockDocMachine('receipt').available('posted', ceo)).toEqual([]);
  expect(stockDocMachine('issue').available('draft', ceo)).toEqual([]);
});
