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
  /** null khi quản trị nền tảng đã gỡ, hoặc mã cũ sai định dạng/trùng (commerio-backend#459) */
  taxCode: string | null;
  /** Người đăng ký, trở thành CEO (UC-PI-01) */
  ceoName: string;
  ceoEmail: string;
  optionalModules: OptionalModuleKey[];
  status: CompanyStatus;
  lockReason?: string;
  lockedAt?: string;
  /** Ngày đăng ký */
  createdAt: string;
  /** Khoá lạc quan khi khoá, mở khoá (docs/21 C3, V18) */
  version: number;
}

export interface LockCompanyInput {
  reason: string;
  version: number;
}
