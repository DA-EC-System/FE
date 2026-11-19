import type { AuditAction, CompanyAuditLog } from '@/types/companySettings';
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
 * Chữ của `operation` (BE#352) theo cặp `entityType` + `operation`: cùng mã có thể mang nghĩa khác tuỳ đối tượng
 * (`approve`, `reject`). Mã của máy trạng thái lấy chữ ở `src/lib/machines/*`; ghép SKU FE chưa có máy, chữ theo BE.
 */
const OPERATION_LABELS: Record<string, Record<string, string>> = {
  'core.memberships': { lock: 'Tạm khoá', unlock: 'Mở khoá', change_roles: 'Đổi vai trò', join: 'Duyệt vào công ty' },
  'core.invitations': { revoke: 'Huỷ link', reject: 'Từ chối' },
  'core.companies': { lock: 'Khoá công ty', unlock: 'Mở khoá công ty' },
  'order.return_requests': {
    accept: 'Chấp nhận trả hàng',
    reject: 'Từ chối',
    refund_only: 'Hoàn tiền, khách giữ hàng',
    receive: 'Nhận hàng trả',
    no_show: 'Khách không gửi hàng',
    platform_reopen: 'Sàn xử cho khách: trả hàng',
    platform_refund: 'Sàn xử cho khách: hoàn tiền',
  },
  'product.purchase_requests': { approve: 'Duyệt', request_changes: 'Trả về', reject: 'Từ chối' },
  'product.goods_receipts': { post: 'Ghi sổ', post_short: 'Ghi sổ, báo giao thiếu' },
  'product.supplier_returns': {
    send_back: 'Trả về',
    approve_send: 'Duyệt và gửi',
    record_refund: 'Nhà cung cấp hoàn tiền',
    record_replaced: 'Nhà cung cấp bù hàng',
    record_rejected: 'Nhà cung cấp không nhận',
  },
  'product.stock_documents': { approve: 'Duyệt và ghi sổ', reject: 'Từ chối' },
  'order.packages': { lose: 'Xác nhận thất lạc', lose_on_unload: 'Dỡ kiện không thấy' },
  'channel.listings': {
    match: 'Ghép SKU',
    approve_mapping: 'Duyệt ghép SKU',
    take_over_content: 'Ghi nội dung Commerio lên sàn',
  },
  'finance.config_versions': { approve: 'Duyệt' },
  'finance.order_settlements': { resolve: 'Chốt lệch' },
};

type OperationRow = Pick<CompanyAuditLog, 'action' | 'entityType' | 'operation'> & {
  after?: Record<string, unknown> | null;
};

/**
 * Chữ cột Thao tác: có `operation` thì chữ của thao tác (mã lạ hiện nguyên mã), không có thì Thêm/Sửa/Xoá theo `action`
 * như dòng ghi trước BE#352. Phiếu kiểm hàng về bị trả lại về nháp (`after.status` `draft`, chỉ có ở chi tiết):
 * "Yêu cầu kiểm lại" như nút trên phiếu.
 */
export function auditOperationLabel(row: OperationRow): string {
  const op = row.operation;
  if (!op) return AUDIT_ACTION_LABELS[row.action].label;
  if (row.entityType === 'product.stock_documents' && op === 'reject' && row.after?.status === 'draft') {
    return 'Yêu cầu kiểm lại';
  }
  return OPERATION_LABELS[row.entityType]?.[op] ?? op;
}

/** Màu nhãn: khoá, từ chối, thất lạc đỏ; mở khoá, duyệt xanh; còn lại theo `action` */
export function auditOperationVariant(row: OperationRow): 'success' | 'destructive' | 'info' {
  const op = row.operation;
  if (!op) return AUDIT_ACTION_LABELS[row.action].variant;
  if (/^(lock|reject|revoke|lose|lose_on_unload|no_show|record_rejected)$/.test(op)) return 'destructive';
  if (/^(unlock|approve|approve_send|approve_mapping|join|accept|post)$/.test(op)) return 'success';
  return 'info';
}

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
  'product.supplier_returns': 'Phiếu trả nhà cung cấp',
  'channel.shops': 'Gian hàng',
  'channel.listings': 'Ghép SKU',
  'channel.category_maps': 'Ghép danh mục sàn',
  'channel.product_specs': 'Thông tin sàn của sản phẩm',
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
  'finance.order_settlements': 'Đối soát đơn',
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
  active: 'Đang hoạt động',
  locked: 'Tạm khoá',
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
