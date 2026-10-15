import type { AuditAction } from '@/types/companySettings';
import { formatDateTime } from '@/utils/format';

export const AUDIT_ACTION_LABELS: Record<
  AuditAction,
  { label: string; color: 'success' | 'error' | 'info' }
> = {
  create: { label: 'Thêm', color: 'success' },
  update: { label: 'Sửa', color: 'info' },
  delete: { label: 'Xoá', color: 'error' },
};

/** entity_type đang có trong nhật ký; mã lạ thì hiện nguyên mã */
export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  'staff.memberships': 'Nhân viên',
  'access.roles': 'Vai trò',
  'platform.company_modules': 'Phân hệ',
  'channel.shops': 'Gian hàng',
};

export const entityTypeLabel = (type: string) => AUDIT_ENTITY_LABELS[type] ?? type;

const FIELD_LABELS: Record<string, string> = {
  name: 'Tên',
  permissions: 'Quyền',
  email: 'Email',
  fullName: 'Họ tên',
  roles: 'Vai trò',
  status: 'Trạng thái',
  invited: 'Gửi thư mời',
  enabled: 'Bật',
  aiConsentAt: 'Đồng ý gửi dữ liệu tới OpenAI',
  shopName: 'Tên gian hàng',
  platform: 'Sàn',
  externalShopId: 'Mã gian hàng trên sàn',
  region: 'Khu vực',
};

export const auditFieldLabel = (field: string) => FIELD_LABELS[field] ?? field;

const VALUE_LABELS: Record<string, string> = {
  active: 'Đang làm',
  locked: 'Đã khoá',
  connected: 'Đã kết nối',
  expiring: 'Sắp hết hạn',
  deauthorized: 'Bị thu hồi',
  disconnected: 'Đã ngắt',
};

/** Giá trị jsonb thành chữ: mảng mỗi phần tử một dòng, ngày ISO theo giờ địa phương */
export function auditValueText(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (Array.isArray(value)) return value.length ? value.map(auditValueText).join('\n') : '—';
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTime(value);
    return VALUE_LABELS[value] ?? value;
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
