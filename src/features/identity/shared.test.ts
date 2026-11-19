import { describe, expect, it } from 'vitest';
import type { CompanyContext } from '@/types/auth';
import type { Role } from '@/types/identity';
import { invitationTransitionMessage, roleLockReason, staffTransitionMessage } from './shared';

const admin: CompanyContext = {
  companyId: 'c1',
  companyName: 'C',
  roles: ['Admin'],
  permissions: ['identity.account.manage', 'inventory.stock.view'],
  enabledModules: ['identity', 'inventory'],
};
const role = (over: Partial<Role>): Role => ({
  id: 'r',
  name: 'Vai',
  builtIn: false,
  permissions: [],
  memberCount: 0,
  version: 1,
  updatedAt: '',
  ...over,
});
const COST = ['inventory.stock.view', 'inventory.cost.view'];

describe('roleLockReason (FE#300, BE#351)', () => {
  it('vai có sẵn Sale, Nhân viên kho không khoá dù có quyền mình chưa có', () => {
    for (const id of ['00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004']) {
      expect(roleLockReason(role({ id, builtIn: true, permissions: COST }), admin)).toBeNull();
    }
  });

  it('CEO vẫn khoá', () => {
    expect(roleLockReason(role({ name: 'CEO', builtIn: true }), admin)).toBe('Vai trò CEO không gán hay gỡ được');
  });

  it('vai tự tạo, vai Admin thiếu quyền: ghi tên quyền thiếu', () => {
    const labels = new Map([['inventory.cost.view', 'Xem giá vốn']]);
    expect(roleLockReason(role({ permissions: COST }), admin, labels)).toBe(
      'Vai trò này có quyền bạn chưa có (Xem giá vốn). Nhờ CEO tạo link hoặc gán vai này.',
    );
    expect(roleLockReason(role({ id: 'role-admin', name: 'Admin', builtIn: true, permissions: COST }), admin)).toMatch(
      /\(inventory\.cost\.view\)/,
    );
  });

  it('đủ quyền thì không khoá', () => {
    expect(roleLockReason(role({ permissions: ['inventory.stock.view'] }), admin)).toBeNull();
  });
});

describe('Câu báo invalid_transition (FE#300, BE#353)', () => {
  const inv = (status: Parameters<typeof invitationTransitionMessage>[0]['status']) => ({
    status,
    fullName: 'Lan',
    email: 'lan@x.vn',
  });

  it('tab Chờ duyệt', () => {
    expect(invitationTransitionMessage(inv('open'), 'pending')).toBe('Người được mời chưa nộp yêu cầu, chưa duyệt được.');
    expect(invitationTransitionMessage(inv('claimed'), 'pending')).toBe('Người được mời chưa nộp yêu cầu, chưa duyệt được.');
    expect(invitationTransitionMessage(inv('approved'), 'pending')).toBe('Yêu cầu của Lan đã được duyệt.');
    expect(invitationTransitionMessage(inv('rejected'), 'pending')).toBe('Yêu cầu của Lan đã bị từ chối.');
    expect(invitationTransitionMessage(inv('revoked'), 'pending')).toBe('Link này đã bị huỷ.');
  });

  it('tab Link đã tạo', () => {
    expect(invitationTransitionMessage(inv('pending'), 'links')).toBe(
      'Người được mời đã nộp yêu cầu. Duyệt hoặc từ chối ở tab Chờ duyệt.',
    );
    expect(invitationTransitionMessage({ status: 'approved', fullName: null, email: 'lan@x.vn' }, 'links')).toBe(
      'Yêu cầu của lan@x.vn đã được duyệt.',
    );
  });

  it('khoá, mở khoá nhân viên', () => {
    expect(staffTransitionMessage({ status: 'locked', fullName: 'Lan' })).toBe('Lan đang bị tạm khoá rồi.');
    expect(staffTransitionMessage({ status: 'active', fullName: 'Lan' })).toBe('Lan đang hoạt động rồi.');
  });
});
