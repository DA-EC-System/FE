import type { PlatformAuditAction } from '@/types/audit';

export const AUDIT_ACTION_LABELS: Record<
  PlatformAuditAction,
  { label: string; color: 'success' | 'error' | 'info' }
> = {
  'company.registered': { label: 'Đăng ký', color: 'info' },
  'company.locked': { label: 'Khoá', color: 'error' },
  'company.unlocked': { label: 'Mở khoá', color: 'success' },
};
