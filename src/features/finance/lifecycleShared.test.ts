import { describe, it, expect } from 'vitest';
import { validateConfig, bankRefSchema } from './lifecycleShared';
import { feeConfigMachine } from '@/lib/machines/feeConfig';
import { resolveBlock, settlementMachine } from '@/lib/machines/settlement';
import { PERMISSIONS as P } from '@/utils/permissions';
import type { OrderPayment } from '@/types/settlement';
const admin = { accountId: 'admin', permissions: [P.configManage, P.settlementResolve] };
const ceo = { accountId: 'ceo', permissions: [P.configManage, P.configApprove, P.settlementResolve, P.settlementApprove], canSelfApprove: true };
const record = { createdBy: 'admin', effectiveFrom: '2026-11-01', today: '2026-10-30', hasDryRun: false };
describe('D4.4 cấu hình', () => {
  it('gửi duyệt cần chạy thử, chỉ duyệt được tự duyệt', () => {
    expect(feeConfigMachine.check('draft', 'submit', { actor: admin, record })).toMatchObject({ ok: false, code: 'dry_run_required' });
    expect(feeConfigMachine.check('draft', 'submit', { actor: admin, record: { ...record, hasDryRun: true } })).toMatchObject({ ok: true });
    expect(feeConfigMachine.check('pending_approval', 'approve', { actor: ceo, record: { ...record, createdBy: 'ceo' } })).toMatchObject({ ok: true, selfApproved: true });
    expect(feeConfigMachine.check('pending_approval', 'reject', { actor: ceo, record: { ...record, createdBy: 'ceo' }, reason: 'Sai phí' })).toMatchObject({ ok: false, code: 'second_person_required' });
  });
  it('không huỷ từ ngày hiệu lực, không sửa trạng thái cuối', () => {
    expect(feeConfigMachine.check('scheduled', 'cancel', { actor: admin, record: { ...record, today: '2026-11-01' } })).toMatchObject({ ok: false, code: 'config_already_effective' });
    expect(feeConfigMachine.available('expired', ceo, record)).toHaveLength(0);
  });
  it('kiểm tiền nguyên đồng, phần trăm, ngày hồi tố và gian hàng', () => {
    expect(validateConfig({ kind: 'fee', effectiveFrom: '2026-11-01', payload: { fixedPct: 101, transactionPct: 1, servicePct: 1, optionalPct: 0, returnFee: 1.5 } })).toHaveProperty('shopId');
    expect(validateConfig({ kind: 'mismatch_threshold', effectiveFrom: 'bad', payload: { abs: -1, pct: 1, resolveLimit: 1.5 } })).toHaveProperty('payload.resolveLimit');
    expect(validateConfig({ kind: 'min_margin', effectiveFrom: '2026-11-01', payload: { pct: 10 }, isCorrection: true, supersedesId: 'x', retroactiveFrom: '2026-11-02' })).toHaveProperty('retroactiveFrom');
    expect(bankRefSchema.safeParse('   ').success).toBe(false);
  });
});
describe('D4.2 chốt lệch', () => {
  const payment = { status: 'mismatch', feeConfigAuthor: { id: 'other', name: 'Khác' }, needsCeoApproval: true, ceoApproval: null } as OrderPayment;
  it('Admin cần CEO duyệt khi vượt ngưỡng; CEO có thể tự chốt', () => {
    expect(resolveBlock(payment, admin)).toBe('ceo_approval_required');
    expect(resolveBlock(payment, ceo)).toBeNull();
    expect(resolveBlock({ ...payment, ceoApproval: { by: { id: 'ceo', name: 'CEO' }, at: '' } }, admin)).toBeNull();
  });
  it('CEO cũng không được chốt lệch cấu hình phí mình soạn', () => {
    expect(resolveBlock({ ...payment, feeConfigAuthor: { id: 'ceo', name: 'CEO' } }, ceo)).toBe('second_person_required');
  });
  it('chốt cần lý do; điều chỉnh mới mở lại mismatch', () => {
    expect(settlementMachine.check('mismatch', 'resolve', { actor: admin })).toMatchObject({ ok: false, code: 'reason_required' });
    expect(settlementMachine.check('resolved', 'new_adjust')).toMatchObject({ ok: true, to: 'mismatch' });
  });
});
