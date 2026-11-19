// P1 · Đăng ký công ty, đăng nhập, chọn công ty, đổi mật khẩu (FE#2; commerio-backend#4, #7)
import { type Page } from '@playwright/test';
import { chua, duongDan, expect, loi, mockApi, test, thayChu } from '../../fixtures';

const dien = async (page: Page, values: Record<string, string>) => {
  for (const [name, value] of Object.entries(values)) await page.locator(`input[name="${name}"]`).fill(value);
};
const oPhanHe = (page: Page, label: string) => chua(page, label, 'form label').locator('[role=checkbox]');
const dangKy = (page: Page) => page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
const dangNhapTay = async (page: Page, email: string, password: string) => {
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
};

const HOP_LE = {
  companyName: 'Công ty Thử',
  taxCode: '0312999888',
  fullName: 'Nguyễn Văn A',
  email: 'moi.dangky@congtythu.vn',
  password: 'matkhau123',
  confirmPassword: 'matkhau123',
};

test.describe('P1 · Đăng ký công ty', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('input[name=companyName]')).toBeAttached();
  });

  test('form đủ ô, 5 phân hệ tuỳ chọn (AC-1)', async ({ page }) => {
    for (const f of Object.keys(HOP_LE)) await expect(page.locator(`input[name=${f}]`)).toHaveCount(1);
    await expect(page.locator('form label [role=checkbox]')).toHaveCount(5);
    await thayChu(page, 'Mười phân hệ lõi');
  });

  test('kiểm dữ liệu tại ô, không gửi lên BE (AC-2)', async ({ page }) => {
    await dien(page, { ...HOP_LE, taxCode: '12345', email: 'abc@', password: 'abcdefgh', confirmPassword: 'abcdefgx' });
    await dangKy(page);
    await expect(loi(page, 'taxCode')).toContainText('Mã số thuế');
    await expect(loi(page, 'email')).toHaveText('Email không hợp lệ');
    await expect(loi(page, 'password')).toContainText('chữ số');
    await expect(loi(page, 'confirmPassword')).toContainText('không khớp');
    await dien(page, { password: '1234567' });
    await dangKy(page);
    await expect(loi(page, 'password')).toContainText('8 ký tự');
    await expect.poll(() => duongDan(page)).toBe('/register');
  });

  test('tích Trợ lý AI thì hỏi đồng ý gửi dữ liệu cho OpenAI (AC-3)', async ({ page }) => {
    await dien(page, HOP_LE);
    await oPhanHe(page, 'Trợ lý AI').click();
    const alert = page.getByRole('alertdialog');
    await expect(alert).toContainText('OpenAI');
    await alert.getByRole('button', { name: 'Không đồng ý', exact: true }).click();
    await expect(alert).toHaveCount(0);
    await expect(oPhanHe(page, 'Trợ lý AI')).toHaveAttribute('data-state', 'unchecked');
    await expect(page.locator('input[name=companyName]')).toHaveValue(HOP_LE.companyName);
    await oPhanHe(page, 'Trợ lý AI').click();
    await alert.getByRole('button', { name: 'Đồng ý', exact: true }).click();
    await expect(oPhanHe(page, 'Trợ lý AI')).toHaveAttribute('data-state', 'checked');
  });

  test('đăng ký thành công thì sang /login, điền sẵn email, đăng nhập được (AC-4)', async ({ page }) => {
    // Test này kiểm nút "Đang đăng ký...": giữ trễ của mock (E2E mặc định bỏ trễ)
    await page.addInitScript(() => Object.assign(window, { __commerioMock: { latencyMs: 350 } }));
    await page.goto('/register');
    await dien(page, HOP_LE);
    await oPhanHe(page, 'Báo cáo').click();
    await dangKy(page);
    await expect(page.getByRole('button', { name: 'Đang đăng ký...', exact: true })).toBeDisabled();
    await expect.poll(() => duongDan(page)).toBe('/login');
    await thayChu(page, 'Đăng ký công ty thành công');
    await expect(page.locator('input[name=email]')).toHaveValue(HOP_LE.email);
    await page.locator('input[name=password]').fill(HOP_LE.password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect.poll(() => duongDan(page)).toMatch(/^\/c\//);
  });

  test('email đã có tài khoản thì báo tại ô (AC-5)', async ({ page }) => {
    await dien(page, { ...HOP_LE, email: 'ceo@commerio.vn' });
    await dangKy(page);
    await expect(loi(page, 'email')).toHaveText('Email này đã có tài khoản');
  });

  test('lỗi BE theo khoá ceo.*, company.* gắn đúng ô (AC-6)', async ({ page }) => {
    await dien(page, HOP_LE);
    await mockApi(page, 'post', '/identity/register', 422, {
      status: 422,
      title: 'Dữ liệu gửi lên không hợp lệ',
      code: 'validation_failed',
      errors: {
        'company.name': 'Tên công ty đã bị cấm',
        'ceo.fullName': 'Họ tên quá ngắn',
        'company.address': 'Thiếu địa chỉ',
      },
    });
    await dangKy(page);
    await expect(loi(page, 'companyName')).toHaveText('Tên công ty đã bị cấm');
    await expect(loi(page, 'fullName')).toHaveText('Họ tên quá ngắn');
    // Lỗi không gắn được vào ô nào thì hiện ở đầu form
    await thayChu(page, 'Thiếu địa chỉ', '[role=alert]');
  });
});

test.describe('P1 · Đăng nhập, chọn công ty', () => {
  test.beforeEach(({ page }) => page.goto('/login'));

  test('trang đăng nhập có Google, Đăng ký công ty, không có Quên mật khẩu (AC-7)', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Đăng nhập bằng Google', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Đăng ký công ty', exact: true })).toBeVisible();
    await expect(page.getByText(/quên mật khẩu/i)).toHaveCount(0);
  });

  test('sai mật khẩu hay email không tồn tại cùng một câu (AC-8, AC-16)', async ({ page }) => {
    await dangNhapTay(page, 'sale@commerio.vn', 'sai-mat-khau');
    await thayChu(page, 'Email hoặc mật khẩu không đúng', '[role=alert]');
    await dangNhapTay(page, 'khong-ton-tai@commerio.vn', 'sale');
    await thayChu(page, 'Email hoặc mật khẩu không đúng', '[role=alert]');
    await expect.poll(() => duongDan(page)).toBe('/login');
  });

  test('một công ty thì vào thẳng (AC-9)', async ({ page }) => {
    await dangNhapTay(page, 'sale@commerio.vn', 'sale');
    await expect.poll(() => duongDan(page)).toMatch(/^\/c\/cmp-001/);
  });

  test('nhiều công ty: công ty hay tài khoản bị khoá hiện mờ có lý do (AC-10)', async ({ page }) => {
    await dangNhapTay(page, 'kho@commerio.vn', 'kho');
    await expect.poll(() => duongDan(page)).toBe('/select-company');
    await expect(chua(page, 'Thời trang ABC', 'button')).toBeEnabled();
    await expect(chua(page, 'Nông sản Sạch', 'button')).toBeDisabled();
    await expect(chua(page, 'Nông sản Sạch', 'button')).toContainText('Công ty đang bị khoá');
    await expect(chua(page, 'Mỹ phẩm XYZ', 'button')).toBeDisabled();
    await expect(chua(page, 'Mỹ phẩm XYZ', 'button')).toContainText('Tài khoản của bạn bị khoá');
  });

  for (const [code, msg] of [
    ['company_locked', 'Công ty đang bị khoá'],
    ['account_locked', 'Tài khoản của bạn đang bị khoá trong công ty này'],
  ]) {
    test(`chọn công ty vừa bị khoá (${code}) thì báo, không tải lại (AC-11, AC-16)`, async ({ page }) => {
      await dangNhapTay(page, 'ceo@commerio.vn', 'ceo');
      await expect(chua(page, 'Minh Phát', 'button')).toBeEnabled();
      await mockApi(page, 'post', '/identity/select-company', 403, { status: 403, title: 'Bị từ chối', code });
      await chua(page, 'Minh Phát', 'button').click();
      // Trang công ty báo lý do và cho quay lại chọn công ty khác, không vào được dữ liệu
      await thayChu(page, msg);
      await expect(page.locator('[data-sidebar="sidebar"]')).toHaveCount(0);
      await page.getByRole('link', { name: 'Chọn công ty khác', exact: true }).click();
      await expect.poll(() => duongDan(page)).toBe('/select-company');
    });
  }

  test('Google: email chưa có thì báo; đã có thì vào như đăng nhập mật khẩu (AC-12)', async ({ page }) => {
    const google = async (email: string) => {
      await page.getByRole('button', { name: 'Đăng nhập bằng Google', exact: true }).click();
      await page.locator('#google-email').fill(email);
      await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
    };
    await google('chua-co@gmail.com');
    await thayChu(page, 'chưa có tài khoản', '[role=alert]');
    await expect.poll(() => duongDan(page)).toBe('/login');
    await google('sale@commerio.vn');
    await expect.poll(() => duongDan(page)).toMatch(/^\/c\/cmp-001/);
  });
});

test.describe('P1 · Đổi mật khẩu thư mời', () => {
  const doi = async (page: Page, current: string, next: string, confirm: string) => {
    await dien(page, { currentPassword: current, newPassword: next, confirmPassword: confirm });
    await page.getByRole('button', { name: 'Lưu mật khẩu mới', exact: true }).click();
  };

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await dangNhapTay(page, 'moi@commerio.vn', 'moi12345');
    await expect.poll(() => duongDan(page)).toBe('/change-password');
  });

  test('kiểm mật khẩu mới, mật khẩu hiện tại sai (AC-13, AC-14)', async ({ page }) => {
    await doi(page, 'moi12345', 'moi12345', 'moi12345');
    await expect(loi(page, 'newPassword')).toContainText('khác mật khẩu hiện tại');
    await doi(page, 'moi12345', 'abcdefgh', 'abcdefgh');
    await expect(loi(page, 'newPassword')).toContainText('chữ số');
    await doi(page, 'moi12345', 'matkhau999', 'matkhau998');
    await expect(loi(page, 'confirmPassword')).toContainText('không khớp');
    await doi(page, 'sai12345', 'matkhau999', 'matkhau999');
    await expect(loi(page, 'currentPassword')).toHaveText('Mật khẩu hiện tại không đúng');
  });

  test('đổi xong thì mở được trang khác; mật khẩu mới dùng được, mật khẩu cũ thì không (AC-15)', async ({ page }) => {
    await doi(page, 'moi12345', 'matkhau999', 'matkhau999');
    await thayChu(page, 'Đã đổi mật khẩu. Lần đăng nhập sau dùng mật khẩu mới.');
    await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
    await expect.poll(() => duongDan(page)).not.toBe('/change-password');

    // Đăng xuất tải lại trang làm mock mất dữ liệu, nên gọi thẳng API đăng nhập ngay trong trang
    const thuDangNhap = (password: string) =>
      page.evaluate(
        (password) =>
          fetch('/api/v1/identity/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'moi@commerio.vn', password }),
          }).then((r) => r.status),
        password,
      );
    expect(await thuDangNhap('moi12345')).toBe(401);
    expect(await thuDangNhap('matkhau999')).toBe(200);
  });
});
