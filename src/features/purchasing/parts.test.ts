import { describe, expect, it } from 'vitest';
import { purchaseRequestMachine, supplierReturnMachine } from '@/lib/machines/purchasing';
import { blockedText, receiptDiff, withApprovalHint } from './parts';

describe('blockedText (FE#137)', () => {
  it('nút duyệt dùng câu ngắn của Test_UI', () => {
    expect(blockedText('approve', 'second_person_required')).toBe('Người duyệt phải khác người soạn.');
    expect(blockedText('approve_send', 'forbidden')).toBe('Bạn không có quyền này.');
  });

  it('nút khác giữ câu chung theo mã, không mã thì null', () => {
    expect(blockedText('record_refund', 'second_person_required')).not.toBe('Người duyệt phải khác người soạn.');
    expect(blockedText('approve', null)).toBeNull();
  });
});

describe('withApprovalHint (FE#137)', () => {
  it('thêm nút duyệt mờ khi người xem thiếu quyền duyệt', () => {
    const out = withApprovalHint(purchaseRequestMachine, 'pending_approval', []);
    expect(out.map((o) => [o.transition.action, o.blocked])).toEqual([['approve', 'forbidden']]);
  });

  it('không thêm khi nút duyệt đã có, hoặc trạng thái không duyệt được', () => {
    const shown = withApprovalHint(purchaseRequestMachine, 'pending_approval', []);
    expect(withApprovalHint(purchaseRequestMachine, 'pending_approval', shown)).toHaveLength(1);
    expect(withApprovalHint(purchaseRequestMachine, 'approved', [])).toEqual([]);
  });

  it('phiếu trả chờ duyệt có nút Duyệt và gửi', () => {
    const out = withApprovalHint(supplierReturnMachine, 'pending_approval', []);
    expect(out.map((o) => o.transition.action)).toEqual(['approve_send']);
  });
});

describe('receiptDiff (FE#137)', () => {
  const base = { outstanding: 5, announced: 5, accepted: 5, defectKept: 0, returnedOnSpot: 0, short: 0 };

  it('khớp, hoặc dòng chưa giao lần này, thì null', () => {
    expect(receiptDiff(base)).toBeNull();
    expect(receiptDiff({ ...base, announced: 0, accepted: 0 })).toBeNull();
  });

  it('liệt kê từng chênh lệch thành một câu', () => {
    expect(receiptDiff({ ...base, announced: 4, accepted: 2, defectKept: 1, short: 1 })).toBe(
      'NCC báo giao 4, còn chờ 5, lỗi giữ 1, thiếu 1.',
    );
    expect(receiptDiff({ ...base, accepted: 4, returnedOnSpot: 1 })).toBe('Trả tại chỗ 1.');
  });
});
