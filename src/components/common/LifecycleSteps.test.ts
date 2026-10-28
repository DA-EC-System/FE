import { describe, expect, it } from 'vitest';
import { lifecycleSteps } from './LifecycleSteps';
import type { StatusMeta } from './StatusBadge';

type S = 'draft' | 'pending' | 'approved' | 'received' | 'needs_fix' | 'rejected';

const statuses: Record<S, StatusMeta> = {
  draft: { label: 'Nháp', variant: 'secondary' },
  pending: { label: 'Chờ duyệt', variant: 'warning' },
  approved: { label: 'Đã duyệt', variant: 'info' },
  received: { label: 'Đã nhận', variant: 'success' },
  needs_fix: { label: 'Cần sửa', variant: 'warning' },
  rejected: { label: 'Từ chối', variant: 'destructive' },
};
const path = ['draft', 'pending', 'approved', 'received'] as const;
const at = '2026-10-28T00:00:00Z';
const step = (to: S) => ({ at, from: null, to, by: null, source: 'user' as const });
const tones = (input: Parameters<typeof lifecycleSteps<S>>[0]) =>
  lifecycleSteps(input).map((s) => `${s.status}:${s.tone}`);

describe('lifecycleSteps', () => {
  it('trạng thái trên đường chính: trước là đã qua, sau là chưa tới', () => {
    expect(tones({ path, current: 'pending', statuses })).toEqual([
      'draft:done',
      'pending:cur',
      'approved:next',
      'received:next',
    ]);
  });

  it('trạng thái ngoài đường chính chen sau bước cuối đã qua', () => {
    expect(tones({ path, current: 'needs_fix', statuses, history: [step('draft'), step('pending')] })).toEqual([
      'draft:done',
      'pending:done',
      'needs_fix:cur',
      'approved:next',
      'received:next',
    ]);
  });

  it('trạng thái kết thúc màu đỏ thì dừng ở đó', () => {
    expect(
      tones({ path, current: 'rejected', statuses, history: [step('draft'), step('pending')], isFinal: (s) => s === 'rejected' }),
    ).toEqual(['draft:done', 'pending:done', 'rejected:bad']);
  });
});
