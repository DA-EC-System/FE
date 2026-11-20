/**
 * Đăng ký công ty với BE thật (commerio-backend#459, Documents/21 mục 2.1): gửi form → nhập mã → BE tạo công ty.
 * Spec không đọc được hộp thư nên dùng mã thử của staging: email thuộc miền `E2E_REGISTRATION_TEST_EMAIL_DOMAIN` nhận mã
 * cố định `E2E_REGISTRATION_TEST_CODE` (cùng giá trị với `REGISTRATION_TEST_EMAIL_DOMAIN`, `REGISTRATION_TEST_CODE` của BE
 * staging). Hai biến đặt ở `.env.e2e.local` khi chạy trên máy, ở secret của repo khi chạy CI; không ghi giá trị vào code.
 */
import { type APIRequestContext, expect } from '@playwright/test';

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thiếu biến ${name}: cần để đăng ký công ty bằng mã thử (e2e/be/dangKy.ts)`);
  return value;
}

/** Email thuộc miền thử, phần trước @ do spec đặt (chữ thường, không dấu) */
export const emailThu = (local: string) => `${local}@${env('E2E_REGISTRATION_TEST_EMAIL_DOMAIN')}`;
export const maThu = () => env('E2E_REGISTRATION_TEST_CODE');

export interface ThongTinDangKy {
  company: { name: string; taxCode: string };
  ceo: { fullName: string; email: string; password: string };
}

/**
 * Gửi form rồi nhập mã thử; trả `companyId` và access token đã gắn công ty. Mã được worker ghi sau khi nhận việc nền,
 * nên nhập ngay có thể sai: chờ rồi thử lại, tối đa 4 lần (BE khoá mã sau 5 lần sai).
 */
export async function dangKyCongTyApi(
  api: APIRequestContext,
  body: ThongTinDangKy,
): Promise<{ companyId: string; accessToken: string }> {
  const register = await api.post('/api/v1/identity/register', { data: body });
  expect(register.status(), await register.text()).toBe(202);
  const { registrationId } = (await register.json()) as { registrationId: string };

  for (let lan = 1; lan <= 4; lan++) {
    await new Promise((r) => setTimeout(r, lan === 1 ? 1500 : 2500));
    const verify = await api.post('/api/v1/identity/register/verify', { data: { registrationId, code: maThu() } });
    if (verify.status() === 201) {
      const res = (await verify.json()) as { accessToken: string; context: { companyId: string } };
      return { companyId: res.context.companyId, accessToken: res.accessToken };
    }
    const text = await verify.text();
    // 422 theo ô `code` (errors.code): worker chưa ghi mã, chờ tiếp; lỗi khác thì dừng
    const wrongCode = verify.status() === 422 && Boolean((JSON.parse(text) as { errors?: { code?: string } }).errors?.code);
    if (!wrongCode) expect(verify.status(), text).toBe(201);
  }
  throw new Error(`Nhập mã thử 4 lần vẫn sai (registrationId ${registrationId}): kiểm biến mã thử của BE staging và worker`);
}
