import type { PlatformAuditAction } from '@/types/audit';

export const AUDIT_ACTION_LABELS: Record<
  PlatformAuditAction,
  { label: string; variant: 'success' | 'destructive' | 'info' }
> = {
  'company.registered': { label: 'Đăng ký mới', variant: 'info' },
  'company.locked': { label: 'Khoá công ty', variant: 'destructive' },
  'company.unlocked': { label: 'Mở khoá công ty', variant: 'success' },
};
