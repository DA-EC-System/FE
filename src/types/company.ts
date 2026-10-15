/**
 * Company (Platform) types — khớp với platform.companies trong docs/19.
 * Đây là phần quản trị nền tảng được xem (UC-PI-08, QT-03): thông tin đăng ký,
 * phân hệ đang bật và trạng thái khoá. Không có dữ liệu kinh doanh.
 */

import type { OptionalModuleKey } from '@/utils/modules';

export type CompanyStatus = 'active' | 'locked';

export interface Company {
  id: string;
  name: string;
  taxCode: string;
  /** Người đăng ký, trở thành CEO (UC-PI-01) */
  ceoName: string;
  ceoEmail: string;
  optionalModules: OptionalModuleKey[];
  status: CompanyStatus;
  lockReason?: string;
  lockedAt?: string;
  /** Ngày đăng ký */
  createdAt: string;
}

export interface LockCompanyInput {
  reason: string;
}
