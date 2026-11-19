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

/** Việc nền đã thử hết lượt mà vẫn lỗi (§14.5). `attempts` kể cả lần đầu; không có tên gian hàng */
export interface DeadJob {
  id: string;
  /** Hàng gốc, vd `channel.order_pull`; FE tự giữ nhãn tiếng Việt */
  queue: string;
  shopId: string | null;
  attempts: number;
  lastError: string;
  failedAt: string;
}

export interface DeadJobParams {
  queue?: string;
  page?: number;
  pageSize?: number;
}

export interface CompanyAuditLog {
  id: string;
  action: AuditAction;
  /** "<schema>.<bảng>", vd "access.roles" */
  entityType: string;
  entityId: string;
  /**
   * Tên đối tượng lúc ghi (BE#352): nhân viên "Họ tên (email)", số chứng từ, tên gian hàng… Dòng ghi trước #352 có thể
   * là mã hay tên bảng.
   */
  entityLabel: string;
  /**
   * Mã thao tác cụ thể (BE#352): `lock`, `unlock`, `change_roles`, `join`, `revoke`, `reject`, hay mã máy trạng thái
   * ở dòng tự duyệt (vd `approve_send`). `null`: chỉ là thêm/sửa/xoá theo `action`.
   */
  operation: string | null;
  actor: ActorRef;
  /** Lần tự duyệt bước cần người duyệt khác (Documents/21 mục 14.1, #246): hiện nhãn "Tự duyệt" */
  selfApproved: boolean;
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
  /** Chỉ các lần tự duyệt */
  selfApproved?: boolean;
}
