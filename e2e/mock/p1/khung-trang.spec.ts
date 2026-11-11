// P1 · Khung trang theo Test_UI (FE#130): sidebar trắng nhóm thu gọn, header trắng có breadcrumb
import { type Page } from '@playwright/test';
import { dangNhap, duongDan, expect, menu, test } from '../../fixtures';

const thanhBen = (page: Page) => page.locator('[data-sidebar="sidebar"]');
const nhom = (page: Page, title: string) => thanhBen(page).locator(`[data-sidebar="group"][data-group="${title}"]`);
const tenNhom = (page: Page, title: string) => nhom(page, title).locator('[data-sidebar="group-label"]');
const viTri = (page: Page) => page.getByRole('navigation', { name: 'Vị trí', exact: true });

/** Menu đang hiện, theo nhóm: `Nhóm: Mục | Mục` */
const menuTheoNhom = async (page: Page) => {
  await expect(thanhBen(page).locator('[data-sidebar="group"]').first()).toBeAttached();
  return thanhBen(page)
    .locator('[data-sidebar="group"]')
    .evaluateAll((groups) =>
      groups.map(
        (g) =>
          `${g.getAttribute('data-group')}: ${[...g.querySelectorAll('[data-sidebar="menu-button"]')]
            .map((b) => b.textContent?.trim())
            .join(' | ')}`,
      ),
    );
};

const khongCuonNgang = async (page: Page) =>
  expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(0);

/** Menu từng vai trò, đúng thứ tự nhóm và mục như trước khi đổi khung */
const MENU: Record<string, string[]> = {
  ceo: [
    'Tổng quan: Tổng quan | Báo cáo kinh doanh',
    'Nhập hàng: Mua hàng',
    'Sản phẩm và kho: Sản phẩm | Danh mục & thuộc tính | Bảng giá | Kho',
    'Bán trên sàn: Kênh bán',
    'Đơn hàng: Đơn hàng | Kiện hàng | Yêu cầu trả | Khách hàng',
    'Tài chính: Sổ tiền | Chứng từ | Thu COD | Hoàn tiền | Khoản thu chưa khớp | Đối soát sàn | Giá chờ xác nhận | Cấu hình phí và thuế | Giao dịch cổng',
    'Quản trị: Nhân viên | Vai trò | Phân hệ | Nhật ký thao tác | Việc nền lỗi | Cổng thanh toán',
    'Dữ liệu giả: Sàn giả lập',
  ],
  admin: [
    'Tổng quan: Tổng quan',
    'Sản phẩm và kho: Sản phẩm | Danh mục & thuộc tính | Bảng giá | Kho',
    'Bán trên sàn: Kênh bán',
    'Đơn hàng: Đơn hàng | Yêu cầu trả | Khách hàng', // Admin có sales.return.view theo ma trận (FE#152)
    'Tài chính: Sổ tiền | Đối soát sàn | Giá chờ xác nhận | Cấu hình phí và thuế',
    'Quản trị: Nhân viên | Vai trò | Nhật ký thao tác | Việc nền lỗi | Cổng thanh toán',
    'Dữ liệu giả: Sàn giả lập',
  ],
  sale: [
    'Tổng quan: Tổng quan',
    'Sản phẩm và kho: Sản phẩm | Bảng giá',
    'Bán trên sàn: Kênh bán',
    'Đơn hàng: Đơn hàng | Yêu cầu trả | Khách hàng',
    'Dữ liệu giả: Sàn giả lập',
  ],
  kho: [
    'Tổng quan: Tổng quan',
    'Nhập hàng: Mua hàng',
    'Sản phẩm và kho: Sản phẩm | Kho',
    'Đơn hàng: Kiện hàng | Yêu cầu trả',
  ],
};

test.describe('P1 · Khung trang', () => {
  for (const [user, expected] of Object.entries(MENU)) {
    test(`menu theo quyền và phân hệ, giữ thứ tự nhóm: ${user}`, async ({ page }) => {
      await dangNhap(page, `${user}@commerio.vn`, user);
      expect(await menuTheoNhom(page)).toEqual(expected);
    });
  }

  test('quản trị nền tảng chỉ thấy menu nền tảng', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name=email]').fill('platform@commerio.vn');
    await page.locator('input[name=password]').fill('platform');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect.poll(() => duongDan(page)).toMatch(/^\/platform/);
    expect(await menuTheoNhom(page)).toEqual(['Quản trị nền tảng: Tổng quan | Công ty | Nhật ký nền tảng']);
    await expect(page.getByTestId('nav-user')).toContainText('Quản trị nền tảng');
    await expect(page.getByTestId('task-bell')).toHaveCount(0);
  });

  test('thu gọn nhóm, tải lại trang vẫn nhớ; mở lại thì hiện mục', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    const taiChinh = tenNhom(page, 'Tài chính');
    await expect(taiChinh).toHaveAttribute('aria-expanded', 'true');
    await expect(nhom(page, 'Tài chính')).toContainText('Sổ tiền');
    await taiChinh.click();
    await expect(taiChinh).toHaveAttribute('aria-expanded', 'false');
    await expect(nhom(page, 'Tài chính').locator('[data-sidebar="menu-button"]')).toHaveCount(0);

    await page.reload();
    await expect(tenNhom(page, 'Tài chính')).toHaveAttribute('aria-expanded', 'false');
    await expect(nhom(page, 'Tài chính').locator('[data-sidebar="menu-button"]')).toHaveCount(0);
    // Nhóm khác không bị ảnh hưởng
    await expect(tenNhom(page, 'Đơn hàng')).toHaveAttribute('aria-expanded', 'true');

    await tenNhom(page, 'Tài chính').click();
    await expect(nhom(page, 'Tài chính')).toContainText('Sổ tiền');
    await page.reload();
    await expect(tenNhom(page, 'Tài chính')).toHaveAttribute('aria-expanded', 'true');
  });

  test('breadcrumb Nhóm / Trang, trang chi tiết thêm mã; mục đang chọn sáng', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await menu(page, 'Kho');
    await expect(viTri(page)).toHaveText(/^Sản phẩm và kho\s*\/\s*Kho$/);
    await expect(thanhBen(page).locator('[data-sidebar="menu-button"][data-active="true"]')).toHaveText('Kho');

    // Nhóm trùng tên mục thì chỉ hiện một lần
    await menu(page, 'Đơn hàng');
    await expect(viTri(page)).toHaveText(/^\s*Đơn hàng\s*$/);
    await page.locator('tbody tr[data-row-id]').first().click();
    await expect.poll(() => duongDan(page)).toMatch(/\/sales\/orders\/[^/]+$/);
    const ma = (await page.locator('main h1').first().innerText()).replace(/^Đơn\s+/, '').trim();
    await expect(viTri(page)).toHaveText(new RegExp(`^\\s*Đơn hàng\\s*/\\s*${ma}\\s*$`));
    await viTri(page).getByRole('link', { name: 'Đơn hàng', exact: true }).click();
    await expect.poll(() => duongDan(page)).toMatch(/\/sales\/orders$/);
    await expect(viTri(page)).toHaveText(/^\s*Đơn hàng\s*$/);
  });

  test('số việc chờ cuối mục, không làm đổi chữ của mục', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    const kenhBan = thanhBen(page).locator('[data-sidebar="menu-item"]', {
      has: page.locator('[data-sidebar="menu-button"]', { hasText: /^\s*Kênh bán\s*$/ }),
    });
    await expect(kenhBan.locator('[data-sidebar="menu-badge"]')).toHaveText(/^\d+\+?$/);
  });

  test('đổi giao diện tối/sáng ở chân sidebar', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    const html = page.locator('html');
    const nut = thanhBen(page).locator('[data-sidebar="footer"] [data-sidebar="menu-button"]', { hasText: /Giao diện/ });
    const toi = (await html.getAttribute('class'))?.includes('dark') ?? false;
    await nut.click();
    await expect(html).toHaveClass(toi ? /^(?!.*\bdark\b)/ : /\bdark\b/);
    await nut.click();
    await expect(html).toHaveClass(toi ? /\bdark\b/ : /^(?!.*\bdark\b)/);
  });

  test('màn 375px không cuộn ngang; sidebar mở bằng Sheet', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 760 });
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await khongCuonNgang(page);
    await expect(thanhBen(page)).toHaveCount(0);
    await page.locator('[data-sidebar="trigger"]').click();
    await expect(thanhBen(page)).toBeVisible();
    await menu(page, 'Đơn hàng');
    await expect.poll(() => duongDan(page)).toMatch(/\/sales\/orders$/);
    await expect(thanhBen(page)).toHaveCount(0);
    await khongCuonNgang(page);
  });
});
