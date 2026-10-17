import type { PlatformAuditAction } from '@/types/audit';

export const AUDIT_ACTION_LABELS: Record<
  PlatformAuditAction,
  { label: string; variant: 'success' | 'destructive' | 'info' }
> = {
  'company.registered': { label: 'Đăng ký', variant: 'info' },
  'company.locked': { label: 'Khoá', variant: 'destructive' },
  'company.unlocked': { label: 'Mở khoá', variant: 'success' },
};
