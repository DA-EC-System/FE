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

/**
 * entity_type (`<schema>.<bảng>`) trong nhật ký, theo tên bảng ở Documents/19 mục 3 (sáu schema `core`, `product`,
 * `channel`, `order`, `finance`, `insight`) và các chỗ BE gọi `recordAudit`. Mã lạ thì hiện nguyên mã.
 */
export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  'core.memberships': 'Nhân viên',
  'core.invitations': 'Lời mời',
  'core.roles': 'Vai trò',
  'core.company_modules': 'Phân hệ',
  'core.companies': 'Công ty',
  'core.accounts': 'Tài khoản',
  'pgboss.job': 'Việc nền lỗi',
  'product.categories': 'Danh mục',
  'product.attributes': 'Thuộc tính',
  'product.products': 'Sản phẩm',
  'product.product_variants': 'Biến thể',
  'product.stock_levels.min_qty': 'Ngưỡng tồn',
  'product.stock_documents': 'Phiếu kho',
  'product.suppliers': 'Nhà cung cấp',
  'product.purchase_requests': 'Đề nghị nhập',
  'product.goods_receipts': 'Phiếu nhận',
  'product.supplier_returns': 'Phiếu trả NCC',
  'channel.shops': 'Gian hàng',
  'channel.listings': 'Ghép SKU',
  'channel.category_maps': 'Ghép danh mục sàn',
  'order.customers': 'Khách hàng',
  'order.orders': 'Đơn hàng',
  'order.packages': 'Kiện hàng',
  'order.return_requests': 'Yêu cầu trả',
  'order.unmatched_return_parcels': 'Hàng hoàn chưa rõ đơn',
  'finance.receipts': 'Phiếu thu',
  'finance.payment_vouchers': 'Phiếu chi',
  'finance.unmatched_receipts': 'Tiền về chưa khớp',
  'finance.gateway_configs': 'Cổng thanh toán',
  'finance.payment_links': 'Mã thanh toán',
  'finance.config_versions': 'Cấu hình phí, thuế',
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
  code: 'Mã chứng từ',
  action: 'Thao tác',
  selfApproved: 'Tự duyệt',
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
