/**
 * Nhật ký cấp nền tảng — bản ghi core.audit_logs có company_id null (D4).
 * Chỉ gồm thao tác cấp nền tảng, không kèm nhật ký bên trong công ty (UC-PI-08).
 */

export type PlatformAuditAction =
  | 'company.registered'
  | 'company.locked'
  | 'company.unlocked'
  /** Quản trị nền tảng gỡ mã số thuế của công ty, kèm lý do (commerio-backend#459) */
  | 'company.tax_code_released';

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
