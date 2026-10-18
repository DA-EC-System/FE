import type { AuditAction } from '@/types/companySettings';
import { formatDateTime } from '@/utils/format';

export const AUDIT_ACTION_LABELS: Record<
  AuditAction,
  { label: string; variant: 'success' | 'destructive' | 'info' }
> = {
  create: { label: 'Thêm', variant: 'success' },
  update: { label: 'Sửa', variant: 'info' },
  delete: { label: 'Xoá', variant: 'destructive' },
};

/** entity_type đang có trong nhật ký; mã lạ thì hiện nguyên mã */
export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  'staff.memberships': 'Nhân viên',
  'access.roles': 'Vai trò',
  'platform.company_modules': 'Phân hệ',
  'channel.shops': 'Gian hàng',
  'channel.channel_listings': 'Ghép SKU',
  'catalog.categories': 'Danh mục',
  'catalog.attributes': 'Thuộc tính',
  'catalog.products': 'Sản phẩm',
  'catalog.product_variants': 'Biến thể',
  'pricing.pricelists': 'Bảng giá',
  'inventory.reorder_rules': 'Ngưỡng tồn',
  'inventory.stock_receipts': 'Phiếu nhập',
  'inventory.stock_issues': 'Phiếu xuất',
  'sales.customers': 'Khách hàng',
  'sales.orders': 'Đơn hàng',
  'payment.gateway_configs': 'Cổng thanh toán',
  'payment.payment_links': 'Mã thanh toán',
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
  skuPattern: 'Quy tắc SKU',
  values: 'Giá trị',
  category: 'Danh mục',
  description: 'Mô tả',
  images: 'Số ảnh',
  variants: 'Biến thể đang bán',
  product: 'Sản phẩm',
  sku: 'SKU',
  attributes: 'Thuộc tính',
  type: 'Loại',
  shop: 'Gian hàng',
  prices: 'Giá',
  minQty: 'Ngưỡng tối thiểu',
  note: 'Ghi chú',
  lines: 'Dòng phiếu',
};

export const auditFieldLabel = (field: string) => FIELD_LABELS[field] ?? field;

const VALUE_LABELS: Record<string, string> = {
  active: 'Đang làm',
  locked: 'Đã khoá',
  connected: 'Đã kết nối',
  expiring: 'Sắp hết hạn',
  deauthorized: 'Bị thu hồi',
  disconnected: 'Đã ngắt',
  standard: 'Bảng giá chuẩn',
  channel: 'Theo gian hàng',
  draft: 'Nháp',
  done: 'Đã ghi sổ',
  cancelled: 'Đã huỷ',
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
