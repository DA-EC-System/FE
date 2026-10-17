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
};

export function problemCode(error: unknown): string | undefined {
  return getProblem(error)?.code;
}

export function problemMessage(error: unknown): string {
  const problem = getProblem(error);
  const code = problem?.code ?? (problem?.status === 404 && problem.title ? 'not_found' : undefined);
  return (code && MESSAGES[code]) || getErrorMessage(error);
}
