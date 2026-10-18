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
  last_variant: 'Không ngừng bán được biến thể cuối cùng. Sản phẩm cần ít nhất một biến thể đang bán.',
  product_has_active_orders: 'Không xoá được vì sản phẩm còn đơn hàng chưa hoàn tất.',
  product_archived: 'Sản phẩm đã lưu trữ nên không sửa được.',
  file_type_not_allowed: 'Chỉ nhận ảnh JPG, PNG hoặc WebP.',
  file_too_large: 'Ảnh lớn hơn 5 MB.',
  // FE#8, chờ commerio-backend#19
  shop_not_connected: 'Gian hàng chưa kết nối hoặc đã mất uỷ quyền. Kết nối lại rồi thử lại.',
  invalid_state: 'Phiên kết nối đã hết hạn hoặc không hợp lệ. Hãy bấm Kết nối lại từ đầu.',
  shop_mismatch: 'Tài khoản sàn vừa uỷ quyền không phải gian hàng đang kết nối lại.',
  sku_taken: 'SKU sàn này đã ghép với biến thể khác.',
  marketplace_error: 'Sàn đang báo lỗi, chưa thực hiện được. Thử lại sau ít phút.',
  price_missing: 'Chưa có giá: bảng giá gian hàng và bảng giá chuẩn đều trống.',
};

export function problemCode(error: unknown): string | undefined {
  return getProblem(error)?.code;
}

export function problemMessage(error: unknown): string {
  const problem = getProblem(error);
  const code = problem?.code ?? (problem?.status === 404 && problem.title ? 'not_found' : undefined);
  return (code && MESSAGES[code]) || getErrorMessage(error);
}
