import type { AuditAction, CompanyAuditLog } from '@/types/companySettings';
import { formatDateTime } from '@/utils/format';

export const AUDIT_ACTION_LABELS: Record<
  AuditAction,
  { label: string; variant: 'success' | 'destructive' | 'info' }
> = {
  create: { label: 'Tạo mới', variant: 'success' },
  update: { label: 'Cập nhật', variant: 'info' },
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
  'product.purchase_requests': { approve: 'Duyệt', request_changes: 'Yêu cầu sửa', reject: 'Từ chối' },
  'product.goods_receipts': { post: 'Ghi sổ', post_short: 'Ghi sổ, báo giao thiếu' },
  'product.supplier_returns': {
    send_back: 'Yêu cầu sửa',
    approve_send: 'Duyệt và gửi',
    record_refund: 'Nhà cung cấp hoàn tiền',
    record_replaced: 'Nhà cung cấp bù hàng',
    record_rejected: 'Nhà cung cấp không nhận',
  },
  'product.stock_documents': { approve: 'Duyệt và ghi sổ', reject: 'Từ chối' },
  'order.packages': { lose: 'Xác nhận thất lạc', lose_on_unload: 'Dỡ kiện không thấy' },
  'channel.listings': {
    match: 'Liên kết SKU',
    approve_mapping: 'Duyệt liên kết SKU',
    take_over_content: 'Ghi nội dung Commerio lên sàn',
  },
  'finance.config_versions': { approve: 'Duyệt' },
  'finance.order_settlements': { resolve: 'Xử lý chênh lệch' },
};

type OperationRow = Pick<CompanyAuditLog, 'action' | 'entityType' | 'operation'> & {
  after?: Record<string, unknown> | null;
};

/**
 * Chữ cột Thao tác: có `operation` thì chữ của thao tác (mã lạ hiện nguyên mã), không có thì Tạo mới/Cập nhật/Xoá theo `action`
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
  'core.company_modules': 'Tính năng',
  'core.companies': 'Công ty',
  'core.accounts': 'Tài khoản',
  'core.refresh_tokens': 'Phiên đăng nhập',
  'pgboss.job': 'Tác vụ lỗi',
  'product.product_groups': 'Nhóm hàng',
  'product.company_product_settings': 'Cài đặt sản phẩm',
  'product.attributes': 'Thuộc tính phân loại',
  'product.products': 'Sản phẩm',
  'product.product_variants': 'Variant',
  'product.stock_levels.min_qty': 'Tồn tối thiểu',
  'product.stock_documents': 'Phiếu kho',
  'product.suppliers': 'Nhà cung cấp',
  'product.purchase_requests': 'Đơn đặt hàng nhập',
  'product.goods_receipts': 'Phiếu nhập kho',
  'product.supplier_returns': 'Phiếu trả hàng NCC',
  'channel.shops': 'Gian hàng',
  'channel.listings': 'Listing',
  'channel.category_maps': 'Liên kết category sàn',
  'channel.product_specs': 'Thông tin sàn của sản phẩm',
  'order.customers': 'Người mua',
  'order.orders': 'Đơn hàng',
  'order.packages': 'Kiện hàng',
  'order.return_requests': 'Trả hàng/Hoàn tiền',
  'order.unmatched_return_parcels': 'Hàng hoàn chưa rõ đơn',
  'finance.receipts': 'Phiếu thu',
  'finance.payment_vouchers': 'Phiếu chi',
  'finance.unmatched_receipts': 'Tiền về chưa khớp đơn',
  'finance.gateway_configs': 'Cổng thanh toán',
  'finance.payment_links': 'Link thanh toán',
  'finance.config_versions': 'Cấu hình phí và thuế',
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
  externalShopId: 'ID gian hàng',
  region: 'Khu vực',
  skuPattern: 'Quy tắc SKU',
  values: 'Giá trị',
  group: 'Nhóm hàng',
  description: 'Mô tả',
  images: 'Số ảnh',
  variants: 'Variant đang bán',
  product: 'Sản phẩm',
  sku: 'SKU',
  attributes: 'Thuộc tính phân loại',
  type: 'Loại',
  shop: 'Gian hàng',
  prices: 'Giá',
  minQty: 'Tồn tối thiểu',
  note: 'Ghi chú',
  lines: 'Dòng phiếu',
  code: 'Mã chứng từ',
  action: 'Thao tác',
  selfApproved: 'Tự duyệt',
  responsibleName: 'Tổ chức chịu trách nhiệm hàng hoá',
  responsibleAddress: 'Địa chỉ tổ chức chịu trách nhiệm',
  // Các trường khác BE ghi qua recordAudit (#332)
  supplierId: 'Nhà cung cấp',
  phone: 'Số điện thoại',
  address: 'Địa chỉ',
  active: 'Đang hợp tác',
  deliveryMode: 'Cách giao',
  attachmentIds: 'Tệp đính kèm',
  requestId: 'Đơn đặt hàng nhập',
  requestLineIds: 'Dòng đơn đặt hàng nhập',
  lineId: 'Dòng phiếu',
  excluded: 'Bỏ khỏi đơn',
  reason: 'Lý do',
  kind: 'Loại phiếu',
  area: 'Khu',
  rejectDecision: 'Xử lý khi từ chối',
  imageFileIds: 'Ảnh',
  sizeChartFileId: 'Bảng kích cỡ',
  imageAttributeId: 'Thuộc tính gắn ảnh',
  attributeValueImage: 'Ảnh theo giá trị thuộc tính',
  originCountry: 'Xuất xứ',
  brand: 'Thương hiệu',
  suggest: 'Gợi ý nhập lại',
  businessStatus: 'Trạng thái kinh doanh',
  contentSource: 'Nguồn nội dung',
  manualPrice: 'Giá tự nhập',
  priceCalcId: 'Lần tính giá',
  remoteTitleAtMatch: 'Tên trên sàn lúc liên kết',
  remoteTitleEnAtMatch: 'Tên tiếng Anh trên sàn lúc liên kết',
  externalCategoryId: 'Category sàn',
  version: 'Phiên bản',
  returnWindowDays: 'Hạn trả hàng (ngày)',
  accessExpiresAt: 'Hạn quyền truy cập',
  refreshExpiresAt: 'Hạn uỷ quyền',
  connectedVia: 'Kết nối qua',
  orderCutoffAt: 'Mốc nhận đơn',
  openingStocktakeId: 'Phiếu kiểm kho đầu kỳ',
  openingStocktakeNumber: 'Số phiếu kiểm kho đầu kỳ',
  openingStocktakeStatus: 'Trạng thái phiếu kiểm kho đầu kỳ',
  stocktakeNumber: 'Số phiếu kiểm kho',
  allocationStocktakeId: 'Phiếu kiểm kho chia tồn',
  lostReported: 'Đã báo thất lạc',
  claimCode: 'Mã khiếu nại',
  flags: 'Cờ',
  queue: 'Hàng đợi',
  state: 'Tình trạng',
  module: 'Tính năng',
  lockReason: 'Lý do khoá',
  ceoEmail: 'Email CEO',
  optionalModules: 'Tính năng bật thêm',
  passwordChanged: 'Đổi mật khẩu',
  googleLinked: 'Liên kết Google',
  familyId: 'Chuỗi phiên đăng nhập',
};

export const auditFieldLabel = (field: string) => FIELD_LABELS[field] ?? field;

/**
 * Bảng phẳng cho mọi đối tượng. Mã trùng giữa hai máy trạng thái mà nghĩa khác (vd `received` của đơn đặt hàng nhập
 * và của trả hàng) chưa có nhãn, hiện nguyên mã; tra theo cặp (đối tượng, trạng thái) là việc sau (#332).
 */
const VALUE_LABELS: Record<string, string> = {
  active: 'Đang hoạt động',
  locked: 'Tạm khoá',
  connected: 'Đã kết nối',
  expiring: 'Sắp hết hạn',
  deauthorized: 'Bị thu hồi uỷ quyền',
  disconnected: 'Đã ngắt kết nối',
  standard: 'Bảng giá chuẩn',
  channel: 'Theo gian hàng',
  draft: 'Nháp',
  done: 'Hoàn thành',
  cancelled: 'Đã huỷ',
  // Chung nhiều chứng từ
  pending: 'Chờ duyệt',
  pending_approval: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
  changes_requested: 'Cần chỉnh sửa',
  // Đơn đặt hàng nhập
  ordered: 'Đã đặt nhà cung cấp',
  partially_received: 'Nhận một phần',
  closed_short: 'Đóng thiếu',
  // Phiếu nhập kho
  counting: 'Đang kiểm',
  matched: 'Khớp',
  short: 'Giao thiếu',
  resolved: 'Đã xử lý',
  // Phiếu kho
  posted: 'Hoàn thành',
  // Phiếu trả hàng NCC
  sent: 'Đã gửi',
  refunded: 'NCC đã hoàn tiền',
  replaced: 'NCC đã bù hàng',
  returned_to_us: 'NCC không nhận',
  // Kiện
  backordered: 'Thiếu hàng',
  reserved: 'Chờ đóng gói',
  packed: 'Đã đóng gói',
  awaiting_pickup: 'Chờ lấy hàng',
  self_delivering: 'Đang tự giao',
  in_transit: 'Đang vận chuyển',
  delivered: 'Đã giao',
  delivery_failed: 'Giao thất bại',
  returning: 'Đang hoàn hàng',
  returned: 'Đã hoàn về kho',
  lost: 'Thất lạc',
  // Trả hàng/Hoàn tiền
  requested: 'Chờ phản hồi',
  awaiting_return: 'Chờ hàng hoàn về',
  refund_only: 'Chỉ hoàn tiền',
  closed: 'Đã đóng',
  // Cấu hình phí và thuế
  scheduled: 'Chưa có hiệu lực',
  superseded: 'Đã thay thế',
  // Trạng thái kinh doanh của SKU
  selling: 'Đang kinh doanh',
  paused: 'Tạm ngừng',
  discontinued: 'Ngừng nhập',
  archived: 'Lưu trữ',
  // Listing
  live: 'Đang bán',
  inactive: 'Đang tắt trên sàn',
  // Lời mời
  open: 'Chưa dùng',
  claimed: 'Đang đăng ký',
  revoked: 'Đã huỷ',
  // Tác vụ lỗi
  dead: 'Hết lượt thử',
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
