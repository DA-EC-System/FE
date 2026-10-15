/**
 * Cài đặt và nhật ký của công ty đang chọn.
 * - CompanyModule: platform.company_modules (UC-PI-02), kèm đồng ý gửi dữ liệu tới OpenAI.
 * - CompanyAuditLog: audit.audit_logs có company_id (UC-PI-07), chỉ đọc.
 * Mọi API lấy công ty từ token; không truyền companyId.
 */

import type { ModuleKey, OptionalModuleKey } from '@/utils/modules';

export interface ActorRef {
  accountId: string;
  email: string;
  fullName: string;
}

export interface CompanyModule {
  code: OptionalModuleKey;
  enabled: boolean;
  /** Lần bật gần nhất */
  enabledAt: string | null;
  enabledBy: ActorRef | null;
  /** Chỉ phân hệ assistant: lúc CEO đồng ý gửi dữ liệu tới OpenAI */
  aiConsentAt: string | null;
  aiConsentBy: ActorRef | null;
  /** Công ty đã có dữ liệu trong phân hệ: không tắt được */
  hasData: boolean;
}

export interface SetModuleInput {
  code: OptionalModuleKey;
  /** Trạng thái muốn chuyển tới; đã ở trạng thái này (phiên khác vừa đổi) thì BE trả 409 */
  enabled: boolean;
  /** Bắt buộc khi bật assistant */
  aiConsent?: boolean;
}

export interface SetModuleResult {
  module: CompanyModule;
  /** Danh sách phân hệ đang bật sau thay đổi, để cập nhật menu ngay */
  enabledModules: ModuleKey[];
}

/** audit_action trong ERD */
export type AuditAction = 'create' | 'update' | 'delete';

export interface CompanyAuditLog {
  id: string;
  action: AuditAction;
  /** "<schema>.<bảng>", vd "access.roles" */
  entityType: string;
  entityId: string;
  /** Tên dễ đọc của đối tượng lúc ghi nhật ký (email, tên vai trò…) */
  entityLabel: string;
  actor: ActorRef;
  createdAt: string;
}

export interface CompanyAuditLogDetail extends CompanyAuditLog {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface CompanyAuditParams {
  page?: number;
  pageSize?: number;
  actorId?: string;
  entityType?: string;
  action?: AuditAction | '';
  /** yyyy-mm-dd, tính theo cả ngày */
  from?: string;
  to?: string;
}
