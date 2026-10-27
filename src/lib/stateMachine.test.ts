import { describe, expect, it } from 'vitest';
import { defineMachine } from './stateMachine';

type S = 'draft' | 'pending' | 'posted' | 'rejected';
type A = 'submit' | 'approve' | 'reject' | 'auto_post';

const doc = defineMachine<S, A, { createdBy: string; lines: number }>([
  { from: 'draft', to: 'pending', action: 'submit', label: 'Gửi duyệt', guard: (r) => (r.lines ? null : 'empty_document') },
  { from: 'pending', to: 'posted', action: 'approve', label: 'Duyệt', permission: 'stock.approve', needsSecondPerson: true },
  { from: ['draft', 'pending'], to: 'rejected', action: 'reject', label: 'Từ chối', needsReason: true },
  { from: 'pending', to: 'posted', action: 'auto_post', label: 'Tự ghi sổ', system: true },
]);

const maker = { accountId: 'a1', permissions: ['stock.approve'] };
const checker = { accountId: 'a2', permissions: ['stock.approve'] };
const viewer = { accountId: 'a3', permissions: [] };
const record = { createdBy: 'a1', lines: 2 };

describe('defineMachine', () => {
  it('cho chuyển hợp lệ và trả trạng thái mới', () => {
    expect(doc.check('draft', 'submit', { record })).toEqual({ ok: true, to: 'pending' });
  });

  it('từ chối thao tác không có từ trạng thái hiện tại', () => {
    expect(doc.check('posted', 'approve')).toEqual({ ok: false, code: 'invalid_transition' });
  });

  it('kiểm quyền', () => {
    expect(doc.check('pending', 'approve', { actor: viewer, record })).toEqual({ ok: false, code: 'forbidden' });
  });

  it('người lập không tự duyệt được', () => {
    expect(doc.check('pending', 'approve', { actor: maker, record })).toEqual({
      ok: false,
      code: 'second_person_required',
    });
    expect(doc.check('pending', 'approve', { actor: checker, record }).ok).toBe(true);
  });

  it('bắt buộc lý do', () => {
    expect(doc.check('pending', 'reject', { reason: '  ' })).toEqual({ ok: false, code: 'reason_required' });
    expect(doc.check('pending', 'reject', { reason: 'Sai số lượng' }).ok).toBe(true);
  });

  it('guard trả mã lỗi riêng', () => {
    expect(doc.check('draft', 'submit', { record: { createdBy: 'a1', lines: 0 } })).toEqual({
      ok: false,
      code: 'empty_document',
    });
  });

  it('available bỏ thao tác của hệ thống và thao tác bị chặn', () => {
    expect(doc.available('pending', maker, record).map((t) => t.action)).toEqual(['reject']);
    expect(doc.available('pending', checker, record).map((t) => t.action)).toEqual(['approve', 'reject']);
  });

  it('isFinal', () => {
    expect(doc.isFinal('posted')).toBe(true);
    expect(doc.isFinal('draft')).toBe(false);
  });
});
