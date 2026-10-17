import { getErrorMessage, getProblem } from '@/api/client';

/**
 * Thông báo theo mã lỗi xác thực (docs/21 A4, V2–V4). FE tự viết câu thay vì hiện `detail` của BE
 * để sai email và sai mật khẩu luôn cùng một câu, còn khoá công ty và khoá tài khoản thì khác nhau.
 */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Email hoặc mật khẩu không đúng.',
  company_locked: 'Công ty đang bị khoá. Nhân viên chưa vào làm việc được cho tới khi công ty được mở khoá.',
  account_locked:
    'Tài khoản của bạn đang bị khoá trong công ty này. Liên hệ CEO hoặc Admin của công ty để được mở khoá.',
  google_account_not_found:
    'Email Google này chưa có tài khoản Commerio. Hệ thống không tự tạo tài khoản; hãy nhờ CEO hoặc Admin công ty mời bạn.',
  google_token_invalid: 'Không xác thực được với Google. Thử đăng nhập lại.',
};

export function authErrorMessage(error: unknown): string {
  const code = getProblem(error)?.code;
  return (code && AUTH_ERROR_MESSAGES[code]) || getErrorMessage(error);
}
