/**
 * Nhật ký cấp nền tảng — bản ghi audit.audit_logs có company_id null (D4).
 * Chỉ gồm thao tác cấp nền tảng, không kèm nhật ký bên trong công ty (UC-PI-08).
 */

export type PlatformAuditAction =
  | 'company.registered'
  | 'company.locked'
  | 'company.unlocked';

export interface PlatformAuditLog {
  id: string;
  action: PlatformAuditAction;
  /** Công ty bị tác động (đối tượng của thao tác) */
  targetCompanyId: string;
  targetCompanyName: string;
  actorEmail: string;
  reason?: string;
  createdAt: string;
}
