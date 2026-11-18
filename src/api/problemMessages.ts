/**
 * Câu báo lỗi theo `code` trong Problem Details (docs/21 C2, mục 3, 4, 10).
 * FE tự viết câu tiếng Việt theo mã để không phụ thuộc `detail` của BE;
 * mã chưa có ở đây thì dùng `detail` như cũ.
 */

import axios from 'axios';
import { getErrorMessage, getProblem, notImplementedMessage, retryAfterSeconds } from './client';
import type { RemoteSkusRefreshError } from '@/types/shop';

const MESSAGES: Record<string, string> = {
  dry_run_required: 'Cần chạy thử trước khi gửi duyệt.',
  config_already_effective: 'Đã tới ngày hiệu lực, không thể huỷ. Hãy soạn bản mới.',
  // commerio-backend#325: sửa lỗi cấu hình
  invalid_correction_target: 'Chỉ sửa lỗi được bản đang áp dụng hoặc đã hết hiệu lực. Bản đang chờ hiệu lực thì huỷ rồi soạn bản mới.',
  correction_date_mismatch: 'Bản sửa lỗi phải cùng ngày hiệu lực với bản bị sửa.',
  config_overlap: 'Đã có phiên bản cùng ngày hiệu lực.',
  ceo_approval_required: 'Lệch vượt hạn mức, cần CEO duyệt trước.',
  approval_not_needed: 'Khoản lệch này không cần CEO duyệt.',
  settlement_running: 'Gian hàng đang có lần kéo quyết toán chưa xong.',
  file_import_unsupported: 'Chưa hỗ trợ nhập tệp báo cáo quyết toán.',
  already_matched: 'Khoản tiền đã được khớp sao kê.',
  not_bank_matchable: 'Chỉ khớp khoản rút tiền, nhà cung cấp hoàn tiền hoặc bồi thường thực tế.',
  not_found: 'Không tìm thấy. Bản ghi đã bị xoá hoặc không thuộc công ty này.',
  // FE#248: BE chưa có route này (404 not_found, detail "Không có đường dẫn ..."), không phải bản ghi bị xoá
  route_missing: 'Chức năng này chưa mở trên máy chủ. Nhóm đang làm, bạn chưa cần làm gì.',
  forbidden: 'Bạn không có quyền thực hiện thao tác này.',
  version_conflict: 'Dữ liệu vừa được người khác sửa. Chưa có gì thay đổi.',
  // docs/21 I3
  permission_not_held: 'Vai trò có quyền bạn không có nên bạn không gán, gỡ hay sửa được.',
  protected_account: 'Không thao tác được trên tài khoản CEO hoặc tài khoản của chính bạn.',
  builtin_role: 'Vai trò có sẵn không sửa hay xoá được.',
  role_in_use: 'Vai trò còn tài khoản đang mang nên không xoá được. Gỡ vai trò khỏi các tài khoản đó trước.',
  role_name_taken: 'Tên vai trò đã được dùng trong công ty.',
  // FE#148, Documents/21 §3.1: mời nhân viên bằng link
  invitation_invalid: 'Link mời không hợp lệ, đã hết hạn hoặc đã bị huỷ. Nhờ người mời tạo link mới.',
  invitation_used: 'Link mời này đã được dùng. Nhờ người mời tạo link khác.',
  invitation_outdated: 'Có vai trò của lời mời đã bị xoá. Từ chối yêu cầu này rồi tạo link mới.',
  registration_expired: 'Phiên đăng ký đã hết hạn. Nhập lại mã xác minh.',
  too_many_requests: 'Thử quá nhiều lần. Đợi một lát rồi thử lại.',
  already_member: 'Người này đã là nhân viên của công ty.',
  email_taken: 'Email này vừa được dùng cho một tài khoản khác. Từ chối yêu cầu rồi gửi link mới cho người đó.',
  // docs/21 M2
  module_has_data: 'Phân hệ đã có dữ liệu nên không tắt được.',
  ai_consent_required: 'Bật Trợ lý AI cần đồng ý gửi dữ liệu tới OpenAI.',
  module_disabled: 'Phân hệ này đã bị tắt. Tải lại trang để cập nhật menu.',
  // docs/21 mục 5
  in_use: 'Không thể xoá vì đang được sử dụng.',
  name_taken: 'Tên này đã được dùng trong công ty.',
  variant_exists: 'Biến thể đã tồn tại.',
  // FE#57, sơ đồ Sản phẩm B1
  archive_blocked: 'Chưa lưu trữ được: SKU còn tồn, hàng đang về, hàng chờ xử lý hoặc chứng từ mở.',
  variant_archived: 'Tổ hợp này là biến thể đã lưu trữ. Dùng Khôi phục để bán lại với SKU cũ.',
  // Documents/21 §17.4: SKU còn listing chưa gỡ thì không xoá trống trường bắt buộc chung
  listing_field_required: 'SKU đang có trên sàn nên không để trống được giá muốn bán, cân nặng, kích thước hoặc ảnh. Gỡ khỏi sàn trước nếu muốn xoá.',
  file_type_not_allowed: 'Kiểu tệp không được nhận (ảnh sản phẩm chỉ JPG hoặc PNG).',
  file_too_large: 'Tệp quá cỡ cho phép (ảnh sản phẩm tối đa 1 MB).',
  // FE#8, chờ commerio-backend#19
  shop_not_connected: 'Gian hàng chưa kết nối hoặc đã mất uỷ quyền. Kết nối lại rồi thử lại.',
  invalid_state: 'Phiên kết nối đã hết hạn hoặc không hợp lệ. Hãy bấm Kết nối lại từ đầu.',
  // §18.4, commerio-backend#103
  oauth_state_invalid: 'Phiên kết nối đã hết hạn hoặc không hợp lệ. Hãy bấm Kết nối lại từ đầu.',
  shop_connected_elsewhere: 'Gian hàng này đã kết nối ở công ty khác.',
  marketplace_unsupported: 'Sàn này chưa hỗ trợ thao tác này.',
  shop_mismatch: 'Tài khoản sàn vừa uỷ quyền không phải gian hàng đang kết nối lại.',
  // §18.7.11; có `expected`, `actual` thì câu nêu tên hai công ty, xem companyMismatchMessage
  company_mismatch: 'Bạn bắt đầu kết nối ở một công ty khác với công ty đang mở. Chuyển về công ty đó rồi kết nối lại.',
  sku_taken: 'SKU sàn này đã ghép với biến thể khác.',
  // §18.6.5
  mapping_pending: 'SKU sàn này đang chờ CEO duyệt ghép. Chờ CEO duyệt hoặc từ chối rồi ghép lại.',
  // Tải SKU sàn (BE#220); có `Retry-After` thì câu nêu số phút, xem retryLaterMessage
  remote_skus_retry_later: 'Lần tải SKU sàn trước bị lỗi. Thử lại sau ít phút.',
  remote_skus_busy: 'Đang tải danh sách SKU trên sàn. Thử lại sau ít phút.',
  marketplace_error: 'Sàn đang báo lỗi, chưa thực hiện được. Thử lại sau ít phút.',
  price_missing: 'Chưa có giá: bảng giá gian hàng và bảng giá chuẩn đều trống.',
  // FE#146, Documents/21 §18.5
  category_unmapped: 'Danh mục của sản phẩm chưa ghép với danh mục sàn. Ghép danh mục rồi đẩy lại.',
  dimensions_missing: 'Sản phẩm thiếu cân nặng hoặc kích thước gói, sàn bắt buộc có.',
  images_missing: 'Sản phẩm chưa có ảnh. Thêm ảnh trong trang sản phẩm rồi đẩy lại.',
  // FE#261, commerio-backend#347: danh mục sàn bắt buộc bảng kích cỡ (quần áo, giày dép)
  size_chart_missing: 'Danh mục sàn bắt buộc ảnh bảng kích cỡ. Thêm ảnh bảng kích cỡ trong trang sản phẩm rồi đẩy lại.',
  // FE#266, Documents/21 §18.6.4 (commerio-backend#305): TikTok kiểm trước khi tạo sản phẩm
  shop_not_eligible:
    'Gian hàng chưa đủ điều kiện đăng sản phẩm trên sàn. Hoàn tất các mục sàn yêu cầu trên Seller Center rồi đẩy lại.',
  listing_check_failed:
    'Sản phẩm chưa đạt luật đăng bán của sàn. Sửa theo lỗi sàn báo (tiêu đề, thuộc tính bắt buộc của danh mục) rồi đẩy lại.',
  already_listed: 'Sản phẩm đã có trên sàn; giá và tồn cập nhật bằng đồng bộ.',
  // FE#264, Documents/21 §18.3 (commerio-backend#360)
  below_floor: 'Giá trên sàn thấp hơn giá thấp nhất. Đẩy lại giá Commerio hoặc gỡ khỏi sàn.',
  // FE#9, chờ commerio-backend#24 và #23
  invalid_transition: 'Bản ghi không còn ở trạng thái cho phép thao tác này. Tải lại để xem trạng thái mới.',
  not_allowed_for_source: 'Đơn sàn lấy trạng thái từ sàn, không cập nhật tay được.',
  payment_not_allowed: 'Đơn này không tạo được mã thanh toán.',
  gateway_not_configured: 'Cổng thanh toán này chưa được cấu hình khoá.',
  gateway_unavailable: 'Cổng thanh toán đang lỗi, thử lại sau ít phút hoặc chọn cổng khác.',
  // FE#59, lib/machines/order.ts (Documents/21 mục 19)
  payment_required: 'Đơn trả trước sang Đang xử lý khi khách thanh toán, không xác nhận tay.',
  already_handed_over: 'Đơn đã có kiện bàn giao, không huỷ được nữa.',
  order_not_processing: 'Đơn chưa ở Đang xử lý (chưa thanh toán hoặc chưa xác nhận) nên chưa đóng gói được.',
  self_delivery: 'Kiện tự giao, không báo sàn sẵn sàng.',
  carrier_delivery: 'Kiện giao qua đơn vị vận chuyển, không tự giao.',
  scan_mismatch: 'Số món quét chưa khớp với kiện.',
  insufficient_stock: 'Không đủ hàng để giữ lại cả kiện. Chờ hàng về rồi mở.',
  package_mismatch: 'Mã quét không phải kiện này.',
  package_group_not_ready: 'Gói gộp còn kiện chưa sẵn sàng.',
  package_sealed: 'Kiện đã đóng gói, mở kiện trước khi chia.',
  already_reported: 'Kiện đã được báo thất lạc.',
  not_reported: 'Chưa ai báo thất lạc kiện này.',
  // FE#12, commerio-backend#27; `already_processed` nơi gọi ưu tiên `detail` vì có số phiếu
  already_processed: 'Chứng từ gốc đã được xử lý.',
  payment_state_changed: 'Trạng thái thanh toán của đơn vừa thay đổi.',
  not_draft: 'Chỉ sửa, xoá, ghi sổ được phiếu chi nháp.',
  amount_mismatch: 'Tổng đơn khác số tiền khoản thu.',
  // FE#13, Documents/21 §12.6
  run_in_progress: 'Lần đối soát trước chưa chạy xong, thử lại sau.',
  // FE#55, lib/stateMachine.ts
  second_person_required: 'Người lập không tự duyệt hay ghi sổ được. Cần người thứ hai.',
  reason_required: 'Thao tác này cần ghi lý do.',
  // FE#56, lib/machines/stockDocument.ts
  empty_document: 'Phiếu chưa có dòng nào.',
  shortage_needs_review: 'Phiếu có phần thiếu nên cần người thứ hai duyệt. Bấm Gửi duyệt phần thiếu.',
  no_shortage: 'Phiếu không có phần thiếu, ghi sổ thẳng được.',
  stock_insufficient: 'Không đủ hàng ở khu vực này để giảm. Xem lại số trên phiếu.',
  decision_made: 'Phiếu đã chọn cách xử lý hàng rồi.',
  // FE#17, lib/machines/purchasing.ts
  all_lines_excluded: 'Đề nghị phải còn ít nhất một dòng không bị loại.',
  has_receipts: 'Đề nghị đã có phiếu nhận nên không huỷ được. Dùng Đóng thiếu nếu nhà cung cấp không giao tiếp.',
  receipt_counting: 'Còn phiếu nhận đang kiểm. Ghi sổ hoặc huỷ phiếu đó trước khi đóng thiếu.',
  has_shortage: 'Phiếu có phần thiếu. Bấm Ghi sổ, báo giao thiếu.',
  supplier_required: 'Chọn nhà cung cấp trước khi gửi duyệt.',
  invalid_period: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.',
  over_outstanding: 'Số nhận đạt và lỗi giữ lại vượt số còn chờ của dòng.',
  resolution_recorded: 'Phiếu đã ghi kết quả giao thiếu rồi.',
  refund_required: 'Nhập số tiền nhà cung cấp hoàn.',
  cancel_decision_required: 'Chọn cách xử lý hàng: nhập lại tồn hoặc lập phiếu xuất huỷ.',
  follow_up_invalid: 'Không tìm thấy phiếu nhận bù cùng đề nghị.',
  supplier_inactive: 'Nhà cung cấp đã ngừng giao dịch.',
  // FE#60, lib/machines/returns.ts
  not_marketplace: 'Chỉ yêu cầu trả từ sàn mới có sàn xử cho khách.',
  marketplace_return: 'Yêu cầu trả của đơn sàn do sàn đẩy về, không lập tay.',
  return_exceeds_delivered: 'Số trả vượt số còn trả được của đơn.',
  return_not_awaiting: 'Yêu cầu trả không ở trạng thái Chờ hàng về.',
  parcel_resolved: 'Kiện hàng trả đã được xử lý.',
  // R9; câu theo việc đang làm ở MARKETPLACE_ACTION_MESSAGES (FE#250, Documents/21 §18.4)
  marketplace_rejected: 'Sàn từ chối thao tác này.',
  marketplace_unauthorized: 'Sàn từ chối quyền truy cập của gian hàng. Kết nối lại gian hàng rồi thử lại.',
  package_status_not_allowed: 'Sàn không cho thao tác ở trạng thái hiện tại của kiện, tải lại để xem trạng thái mới.',
  item_not_packable: 'Có món sàn không cho đóng gói (đã huỷ hoặc đang xin huỷ).',
  rts_package_not_found: 'Sàn không thấy kiện để báo sẵn sàng giao, đóng gói lại rồi thử lại.',
  document_not_ready: 'Vận đơn chưa sẵn sàng. Thử lại sau ít phút nếu sàn đang tạo tệp.',
  // §18.6.1, commerio-backend#207; có `openOrders` thì câu kèm số, xem openOrdersMessage
  shop_has_open_orders: 'Còn đơn chưa xong. Đợi các đơn hoàn tất hoặc huỷ rồi ngắt.',
  // §18.6.2
  // R13, §18.7.9: mọi 501 chức năng chờ issue khác; có `issue`, `owner` thì câu nêu issue, xem notImplementedMessage
  not_implemented: 'Chức năng này chưa làm xong',
  shop_awaiting_stocktake: 'Gian hàng đang chờ kiểm kê đầu kỳ. Ghi sổ phiếu kiểm kê đầu kỳ rồi thử lại.',
  // Documents#55 (21 mục 5, 16, 18.3, 19), FE#153
  product_in_use: 'Sản phẩm đã hoàn thiện hoặc đã có chứng từ, listing nên không xoá hẳn được. Dùng Lưu trữ.',
  too_many_axes: 'Một sản phẩm chỉ có tối đa 2 trục phân loại.',
  unsupported_file_type: 'Chỉ nhận tệp CSV, XLSX hoặc TXT.',
  evidence_required: 'Tài xế để hàng lại mà có lỗi hoặc thiếu: đính ảnh mở thùng trước khi ghi sổ.',
  shop_not_active: 'Gian hàng chưa hoạt động. Hoàn tất thiết lập gian hàng trước khi đẩy sản phẩm.',
  handover_confirmed_by_platform:
    'Không huỷ bàn giao được: sàn đã xác nhận lấy hàng, hoặc kiện không được bàn giao bằng quét ở kho.',
  // §18.6.11 (Documents#95); có `waitingFor` thì câu theo lý do, xem awaitingAllocationMessage
  shop_awaiting_allocation: 'Gian hàng đang giữ tồn. Đẩy sản phẩm sau khi kéo đơn và chia hàng xong.',
  // §18.6.11: lập lại phiếu kiểm kê đầu kỳ; có `number` thì câu nêu số phiếu, xem problemMessage
  shop_not_awaiting_stocktake: 'Gian hàng không còn chờ phiếu kiểm kê đầu kỳ.',
  opening_stocktake_open: 'Phiếu kiểm kê đầu kỳ vẫn đang mở. Sửa hoặc duyệt phiếu này.',
  // §18.6.8: hết lượt gọi sàn cho thao tác tay (`platformCode` company_call_limit, daily_call_limit)
  call_limit: 'Hôm nay đã hết lượt gọi sàn cho thao tác tay. Việc tự động vẫn chạy và sẽ đồng bộ sau.',
  // §18.5, §18.6.4: mã của từng dòng PushResult
  push_in_progress: 'Đang đẩy, chờ sàn trả kết quả.',
  sku_not_ready: 'SKU chưa đủ điều kiện bán (xem trạng thái sản phẩm).',
  platform_hold: 'Sàn đang khoá sản phẩm này.',
};

/**
 * 409 `marketplace_rejected` sàn trả thiếu danh sách SKU. BE trước BE#361 trả lỗi này ngay trên POST Tải lại; BE#361
 * chuyển vào `refresh.error` (xem remoteRefreshErrorMessage). Không có `Retry-After` thì lấy mốc khoá 10 phút của BE
 */
export const INCOMPLETE_LIST_CODES = ['incomplete_list', 'too_many_calls'];
const REMOTE_SKUS_LOCK_MINUTES = 10;

function incompleteListMessage(error: unknown): string {
  const raw = axios.isAxiosError(error) ? Number(error.response?.headers?.['retry-after']) : NaN;
  const minutes = Number.isFinite(raw) && raw > 0 ? Math.ceil(raw / 60) : REMOTE_SKUS_LOCK_MINUTES;
  return `Sàn trả thiếu danh sách SKU, thử lại sau ${minutes} phút.`;
}

/** Lỗi của lượt tải SKU sàn chạy nền (`refresh.error`, §18.3, BE#361) không có câu chung trong MESSAGES */
const REFRESH_ERROR_MESSAGES: Record<string, string> = {
  timed_out: 'Sàn trả danh sách SKU quá 10 phút nên lượt tải đã dừng.',
  marketplace_unavailable: 'Sàn đang lỗi, chưa tải được danh sách SKU.',
  marketplace_unauthorized: 'Sàn từ chối quyền truy cập của gian hàng. Kết nối lại gian hàng rồi tải lại.',
  marketplace_rejected: 'Sàn chưa trả được danh sách SKU.',
};

/**
 * Câu báo lượt tải SKU sàn hỏng (§18.3, BE#361). `secondsLeft`: số giây còn lại tới lúc được tải lại, đếm ngược từ
 * `error.retryAfterSeconds`; còn thì câu nêu số phút làm tròn lên, hết thì mời bấm Tải lại
 */
export function remoteRefreshErrorMessage(error: RemoteSkusRefreshError, secondsLeft: number | null): string {
  const minutes = secondsLeft && secondsLeft > 0 ? Math.ceil(secondsLeft / 60) : null;
  if (error.code === 'marketplace_rejected' && error.platformCode && INCOMPLETE_LIST_CODES.includes(error.platformCode)) {
    return minutes
      ? `Sàn trả thiếu danh sách SKU, thử lại sau ${minutes} phút.`
      : 'Sàn trả thiếu danh sách SKU. Bấm Tải lại để thử lại.';
  }
  if (error.platformCode && CALL_LIMIT_CODES.includes(error.platformCode)) return MESSAGES.call_limit;
  // Bấm lại cũng không qua (vd gian hàng quá 10.000 sản phẩm): không mời tải lại
  if (error.code === 'marketplace_rejected' && error.platformCode && REJECTED_PLATFORM_MESSAGES[error.platformCode]) {
    return REJECTED_PLATFORM_MESSAGES[error.platformCode];
  }
  const base = REFRESH_ERROR_MESSAGES[error.code] ?? MESSAGES[error.code] ?? error.message;
  return minutes ? `${base} Thử lại sau ${minutes} phút.` : `${base} Bấm Tải lại để thử lại.`;
}

/** 503 `marketplace_unavailable` vì hết hạn mức gọi sàn trong ngày (§18.6.8) */
export const CALL_LIMIT_CODES = ['company_call_limit', 'daily_call_limit'];

/** Câu báo 409 `shop_awaiting_allocation` theo `waitingFor` (§18.6.11): lượt đơn mở chưa xong hay chưa chia hàng xong */
export function awaitingAllocationMessage(waitingFor: unknown): string {
  if (waitingFor === 'open_orders') return 'Đang kéo đơn còn mở về. Đẩy sản phẩm sau khi lượt này xong.';
  if (waitingFor === 'allocation') return 'Đang chia hàng cho các kiện sau kiểm kê. Đẩy sản phẩm sau khi chia xong.';
  return MESSAGES.shop_awaiting_allocation;
}

interface ShopRef {
  name: string | null;
  externalShopId: string;
}

const shopRefLabel = (ref: ShopRef) => ref.name ?? ref.externalShopId;

export function isShopRef(value: unknown): value is ShopRef {
  return typeof value === 'object' && value !== null && typeof (value as ShopRef).externalShopId === 'string';
}

/**
 * Câu báo khi đăng nhập nhầm gian hàng lúc kết nối lại (§18.4 `shop_mismatch`).
 * `actual.name` có thể null thì hiện mã gian hàng; thiếu expected/actual thì dùng câu chung.
 */
export function shopMismatchMessage(expected: unknown, actual: unknown): string {
  if (!isShopRef(expected) || !isShopRef(actual)) return MESSAGES.shop_mismatch;
  return `Bạn vừa đăng nhập ${shopRefLabel(actual)}, không phải ${shopRefLabel(expected)}. Đăng xuất trên sàn, đăng nhập đúng tài khoản rồi kết nối lại.`;
}

/** Công ty trong problem body 409 company_mismatch (§18.7.4) */
export interface CompanyRef {
  id: string;
  name: string;
}

export function isCompanyRef(value: unknown): value is CompanyRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as CompanyRef).id === 'string' &&
    typeof (value as CompanyRef).name === 'string'
  );
}

/**
 * Câu báo khi công ty trong state khác công ty đang mở lúc sàn trả về (§18.7.11 `company_mismatch`).
 * `expected` là công ty bắt đầu kết nối, `actual` là công ty đang mở; thiếu thì dùng câu chung.
 */
export function companyMismatchMessage(expected: unknown, actual: unknown): string {
  if (!isCompanyRef(expected) || !isCompanyRef(actual)) return MESSAGES.company_mismatch;
  return `Bạn bắt đầu kết nối ở công ty ${expected.name} nhưng đang mở ${actual.name}. Chuyển sang ${expected.name} rồi kết nối lại.`;
}

/**
 * Câu báo khi ngắt gian hàng còn đơn chưa `completed` hoặc `cancelled` (§18.6.1).
 * BE chưa lên commerio-backend#207 thì body thiếu `openOrders`, báo câu không có số.
 */
export function openOrdersMessage(openOrders: unknown): string {
  return typeof openOrders === 'number' && openOrders > 0
    ? `Còn ${openOrders} đơn chưa xong. Đợi các đơn hoàn tất hoặc huỷ rồi ngắt.`
    : MESSAGES.shop_has_open_orders;
}

/** Câu tiếng Việt của một mã lỗi (lý do nút bị chặn); mã lạ hiện nguyên */
export function codeMessage(code: string): string {
  return MESSAGES[code] ?? code;
}

export function problemCode(error: unknown): string | undefined {
  return getProblem(error)?.code;
}

/** Câu BE ghi khi không có route (`error-handler.ts` của BE: 404 not_found) */
const ROUTE_MISSING_PREFIX = 'Không có đường dẫn ';

/**
 * 404 vì BE chưa có route (chức năng chưa mở), khác 404 bản ghi không có hay thuộc công ty khác (FE#248).
 * BE trả cùng mã `not_found`, chỉ khác `detail`.
 */
export function isRouteMissing(error: unknown): boolean {
  const problem = getProblem(error);
  return (
    problem?.status === 404 &&
    (problem.code === undefined || problem.code === 'not_found') &&
    typeof problem.detail === 'string' &&
    problem.detail.startsWith(ROUTE_MISSING_PREFIX)
  );
}

/** 429 `remote_skus_retry_later`: đổi `Retry-After` (giây) ra phút, làm tròn lên */
function retryLaterMessage(error: unknown): string {
  const seconds = retryAfterSeconds(error);
  return seconds
    ? `Lần tải SKU sàn trước bị lỗi. Thử lại sau ${Math.ceil(seconds / 60)} phút.`
    : MESSAGES.remote_skus_retry_later;
}

/** Việc đang làm với sàn; chọn câu cho `marketplace_rejected`, `marketplace_unauthorized` (FE#250, Documents/21 §18.4) */
export type MarketplaceAction = 'connect' | 'rts' | 'push' | 'remote_skus' | 'cancel';

const CONNECT_REJECTED =
  'Sàn không nhận lần uỷ quyền này. Liên kết uỷ quyền chỉ dùng được một lần trong vài phút; bấm Kết nối lại từ đầu.';

const MARKETPLACE_ACTION_MESSAGES: Record<MarketplaceAction, Record<string, string>> = {
  connect: { marketplace_rejected: CONNECT_REJECTED, marketplace_unauthorized: CONNECT_REJECTED },
  rts: {
    marketplace_rejected: 'Sàn chưa nhận báo sẵn sàng giao của kiện này. Tải lại kiện để xem trạng thái trên sàn rồi thử lại.',
  },
  push: { marketplace_rejected: 'Sàn từ chối đẩy sản phẩm.' },
  remote_skus: { marketplace_rejected: 'Sàn chưa trả được danh sách SKU. Thử lại sau ít phút.' },
  cancel: { marketplace_rejected: 'Sàn không cho huỷ đơn này.' },
};

/** `platformCode` của `marketplace_rejected` có câu riêng ở mọi ngữ cảnh */
const REJECTED_PLATFORM_MESSAGES: Record<string, string> = {
  no_shop: 'Tài khoản này không có gian hàng nào trên sàn. Đăng nhập (hoặc lấy token) bằng tài khoản người bán có gian hàng.',
  too_many_products: 'Gian hàng quá 10.000 sản phẩm, sàn không cho đọc hết danh sách.',
};

function marketplaceMessage(code: string | undefined, platformCode: string | undefined, action?: MarketplaceAction) {
  if (code === 'marketplace_rejected' && platformCode && REJECTED_PLATFORM_MESSAGES[platformCode]) {
    return REJECTED_PLATFORM_MESSAGES[platformCode];
  }
  return code && action ? MARKETPLACE_ACTION_MESSAGES[action][code] : undefined;
}

export interface ProblemSummary {
  message: string;
  /** Câu gốc của sàn, hiện riêng trong "Chi tiết từ sàn" */
  platformMessage?: string;
}

/** Câu báo lỗi và câu gốc của sàn tách riêng; `action` chọn câu cho lỗi sàn chung */
export function problemSummary(error: unknown, action?: MarketplaceAction): ProblemSummary {
  const problem = getProblem(error);
  if (problem?.code === 'remote_skus_retry_later') return { message: retryLaterMessage(error) };
  const code = isRouteMissing(error)
    ? 'route_missing'
    : (problem?.code ?? (problem?.status === 404 && problem.title ? 'not_found' : undefined));
  if (problem?.platformCode && CALL_LIMIT_CODES.includes(problem.platformCode)) return { message: MESSAGES.call_limit };
  const message =
    code === 'marketplace_rejected' && problem?.platformCode && INCOMPLETE_LIST_CODES.includes(problem.platformCode)
      ? incompleteListMessage(error)
      : code === 'shop_awaiting_allocation'
      ? awaitingAllocationMessage(problem?.waitingFor)
      : code === 'opening_stocktake_open' && problem?.number
        ? `Phiếu ${problem.number} vẫn đang mở. Sửa hoặc duyệt phiếu này.`
        : code === 'shop_has_open_orders'
        ? openOrdersMessage(problem?.openOrders)
        : code === 'shop_mismatch'
          ? shopMismatchMessage(problem?.expected, problem?.actual)
          : code === 'company_mismatch'
            ? companyMismatchMessage(problem?.expected, problem?.actual)
            : code === 'not_implemented'
              ? notImplementedMessage(problem?.issue, problem?.owner)
              : marketplaceMessage(code, problem?.platformCode, action) || (code && MESSAGES[code]) || getErrorMessage(error);
  return problem?.platformMessage ? { message, platformMessage: problem.platformMessage } : { message };
}

/** Câu báo lỗi cho toast, dòng lỗi: câu gốc của sàn nối sau "Sàn báo:" */
export function problemMessage(error: unknown, action?: MarketplaceAction): string {
  const { message, platformMessage } = problemSummary(error, action);
  return platformMessage ? `${message} Sàn báo: ${platformMessage}` : message;
}

/** Nơi lấy token dán tay theo sàn (`tich-hop-san/lazada.md` §3.1, `tich-hop-san/tiktok.md`) */
const TOKEN_SOURCES: Record<string, string> = {
  lazada: 'Lazada Open Platform → Testing Tools → API Explorer',
  tiktok: 'TikTok Shop Partner Center → API Testing Tool',
};

/** "ở <nơi lấy token>" để ghép vào câu; sàn chưa ghi nơi lấy thì nói chung */
export function tokenSourcePhrase(platform: string): string {
  const source = TOKEN_SOURCES[platform];
  return source ? `ở ${source}` : 'trên trang nhà phát triển của sàn';
}

/** Lỗi khi dán token (§18.4): sàn từ chối thì nói token sai và chỗ lấy token mới, trừ khi token không ra gian hàng */
export function tokenErrorMessage(error: unknown, platform: string): ProblemSummary {
  const problem = getProblem(error);
  const summary = problemSummary(error, 'connect');
  const isMarketplace = problem?.code === 'marketplace_rejected' || problem?.code === 'marketplace_unauthorized';
  if (!isMarketplace || (problem?.platformCode && REJECTED_PLATFORM_MESSAGES[problem.platformCode])) return summary;
  return { ...summary, message: `Sàn từ chối token này. Kiểm tra lại token hoặc lấy token mới ${tokenSourcePhrase(platform)}.` };
}
