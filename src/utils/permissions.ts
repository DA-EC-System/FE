import type { User } from '@/types/auth';

export type Action = 'view' | 'create' | 'update' | 'delete' | 'sync';

export type Resource = 'company' | 'shop';

interface CanParams {
  user: User | null;
  action: Action;
  resource: Resource;
}

/**
 * Kiểm tra user có quyền thao tác trên resource hay không.
 *
 * Quy tắc phân quyền (theo tài liệu đồ án §2.1):
 *  - Platform Admin (isPlatformAdmin=true): làm được mọi thứ trên mọi company.
 *  - Company Admin (roles chứa 'admin'): CRUD đầy đủ resource thuộc company mình.
 *  - Vai trò khác: chỉ khi permission chi tiết cho phép ("shop:create", "company:delete"…).
 *  - Resource "company" chỉ cho phép Platform Admin (công ty là tenant cha).
 */
export function can({ user, action, resource }: CanParams): boolean {
  if (!user) return false;

  if (user.isPlatformAdmin) return true;

  // Company-level actions cần quyền nâng cao (chỉ platform admin mặc định có).
  if (resource === 'company' && action !== 'view') return false;
  if (resource === 'company' && action === 'view') {
    return user.roles.includes('admin') || user.roles.includes('ceo');
  }

  if (user.roles.includes('admin') || user.roles.includes('ceo')) return true;

  return user.permissions.includes(`${resource}:${action}`);
}

/** Helper cho JSX: `<Show when={can(...)}>...</Show>` style. */
export function makeCan(user: User | null) {
  return (action: Action, resource: Resource) =>
    can({ user, action, resource });
}
