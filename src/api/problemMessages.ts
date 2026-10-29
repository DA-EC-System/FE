/**
 * Câu báo lỗi theo `code` trong Problem Details (docs/21 C2, mục 3, 4, 10).
 * FE tự viết câu tiếng Việt theo mã để không phụ thuộc `detail` của BE;
 * mã chưa có ở đây thì dùng `detail` như cũ.
 */

import { getErrorMessage, getProblem } from './client';

const MESSAGES: Record<string, string> = {
  not_found: 'Không tìm thấy. Bản ghi đã bị xoá hoặc không thuộc công ty này.',
  forbidden: 'Bạn không có quyền thực hiện thao tác này.',
  version_conflict: 'Dữ liệu vừa được người khác sửa. Chưa có gì thay đổi.',
  // docs/21 I3
  permission_not_held: 'Vai trò có quyền bạn không có nên bạn không gán, gỡ hay sửa được.',
  protected_account: 'Không thao tác được trên tài khoản CEO hoặc tài khoản của chính bạn.',
  builtin_role: 'Vai trò có sẵn không sửa hay xoá được.',
  role_in_use: 'Vai trò còn tài khoản đang mang nên không xoá được. Gỡ vai trò khỏi các tài khoản đó trước.',
  role_name_taken: 'Tên vai trò đã được dùng trong công ty.',
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
  product_archived: 'Sản phẩm đã lưu trữ nên không sửa được.',
  file_type_not_allowed: 'Chỉ nhận ảnh JPG, PNG hoặc WebP.',
  file_too_large: 'Ảnh lớn hơn 5 MB.',
  // FE#8, chờ commerio-backend#19
  shop_not_connected: 'Gian hàng chưa kết nối hoặc đã mất uỷ quyền. Kết nối lại rồi thử lại.',
  invalid_state: 'Phiên kết nối đã hết hạn hoặc không hợp lệ. Hãy bấm Kết nối lại từ đầu.',
  // §18.4, commerio-backend#103
  oauth_state_invalid: 'Phiên kết nối đã hết hạn hoặc không hợp lệ. Hãy bấm Kết nối lại từ đầu.',
  seller_not_whitelisted: 'Gian hàng chưa được cấp quyền dùng thử ứng dụng. Liên hệ quản trị để thêm vào danh sách.',
  shop_connected_elsewhere: 'Gian hàng này đã kết nối ở công ty khác.',
  marketplace_unsupported: 'Sàn này chưa hỗ trợ thao tác này.',
  shop_mismatch: 'Tài khoản sàn vừa uỷ quyền không phải gian hàng đang kết nối lại.',
  sku_taken: 'SKU sàn này đã ghép với biến thể khác.',
  marketplace_error: 'Sàn đang báo lỗi, chưa thực hiện được. Thử lại sau ít phút.',
  price_missing: 'Chưa có giá: bảng giá gian hàng và bảng giá chuẩn đều trống.',
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
  package_mismatch: 'Mã quét không phải kiện này.',
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
  has_receipts: 'Đề nghị đã có phiếu nhận nên không huỷ được. Dùng Đóng thiếu nếu NCC không giao tiếp.',
  receipt_counting: 'Còn phiếu nhận đang kiểm. Ghi sổ hoặc huỷ phiếu đó trước khi đóng thiếu.',
  has_shortage: 'Phiếu có phần thiếu. Bấm Ghi sổ, báo giao thiếu.',
  supplier_required: 'Chọn nhà cung cấp trước khi gửi duyệt.',
  invalid_period: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.',
  over_outstanding: 'Số nhận đạt và lỗi giữ lại vượt số còn chờ của dòng.',
  resolution_recorded: 'Phiếu đã ghi kết quả giao thiếu rồi.',
  refund_required: 'Nhập số tiền NCC hoàn.',
  cancel_decision_required: 'Chọn cách xử lý hàng: nhập lại tồn hoặc lập phiếu xuất huỷ.',
  follow_up_invalid: 'Không tìm thấy phiếu nhận bù cùng đề nghị.',
  supplier_inactive: 'Nhà cung cấp đã ngừng giao dịch.',
  // FE#60, lib/machines/returns.ts
  not_marketplace: 'Chỉ yêu cầu trả từ sàn mới có sàn xử cho khách.',
  marketplace_return: 'Yêu cầu trả của đơn sàn do sàn đẩy về, không lập tay.',
  return_exceeds_delivered: 'Số trả vượt số còn trả được của đơn.',
  return_not_awaiting: 'Yêu cầu trả không ở trạng thái Chờ hàng về.',
  parcel_resolved: 'Kiện hàng trả đã được xử lý.',
  // §19.3, commerio-backend#105, #106
  marketplace_rejected: 'Sàn không cho huỷ đơn này.',
  package_status_not_allowed: 'Sàn không cho thao tác ở trạng thái hiện tại của kiện, tải lại để xem trạng thái mới.',
  item_not_packable: 'Có món sàn không cho đóng gói (đã huỷ hoặc đang xin huỷ).',
  rts_package_not_found: 'Sàn không thấy kiện để báo sẵn sàng giao, đóng gói lại rồi thử lại.',
  document_not_ready: 'Kiện chưa có mã kiện sàn nên chưa in được vận đơn.',
};

/** Câu tiếng Việt của một mã lỗi (lý do nút bị chặn); mã lạ hiện nguyên */
export function codeMessage(code: string): string {
  return MESSAGES[code] ?? code;
}

export function problemCode(error: unknown): string | undefined {
  return getProblem(error)?.code;
}

export function problemMessage(error: unknown): string {
  const problem = getProblem(error);
  const code = problem?.code ?? (problem?.status === 404 && problem.title ? 'not_found' : undefined);
  const message = (code && MESSAGES[code]) || getErrorMessage(error);
  // Câu gốc của sàn kèm theo để người dùng biết sàn báo gì
  return problem?.platformMessage ? `${message} Sàn báo: ${problem.platformMessage}` : message;
}
