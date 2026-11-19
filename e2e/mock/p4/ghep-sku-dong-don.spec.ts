// P4 · Ghép SKU từ dòng đơn trên trang chi tiết đơn (sơ đồ D1; FE#283, commerio-backend#237)
import { type Page } from '@playwright/test';
import { dangNhap, expect, phatSuKienSan, test, toast } from '../../fixtures';

const SKU_CU = 'OLD-TEE-01';

/** Sàn đẩy đơn mới mang SKU chưa ghép của Shopee rồi mở chi tiết đơn. Không tải lại trang: mock nằm trong bộ nhớ trang */
async function moDonChuaGhep(page: Page) {
  await page.goto('/c/cmp-001/sales/orders');
  const timDon = page.getByPlaceholder('Tìm mã đơn, mã đơn sàn', { exact: true });
  await expect(timDon).toBeVisible();
  const code = (await phatSuKienSan(page, 'order.created', 'shp-001', { sku: SKU_CU })).split(':')[0]!;
  await timDon.fill(code);
  await expect(page.locator('tbody tr[data-row-id]')).toHaveCount(1);
  await page.locator('tbody tr[data-row-id]').first().click();
  await expect(page.getByRole('heading', { name: `Đơn ${code}` })).toBeVisible();
  return code;
}

const dongChuaGhep = (page: Page) => page.locator('[data-testid=line-unmapped]');
const nutGhep = (page: Page) => dongChuaGhep(page).getByRole('button', { name: 'Ghép SKU', exact: true });

/** `option` null: biến thể đầu danh sách */
async function chonVaLuu(page: Page, option: RegExp | null) {
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Ghép SKU sàn' })).toBeVisible();
  await (option ? dialog.getByRole('radio', { name: option }) : dialog.getByRole('radio').first()).check();
  await dialog.getByRole('button', { name: 'Lưu ghép', exact: true }).click();
  await expect(dialog).toBeHidden();
}

test.describe('Ghép SKU từ dòng đơn', () => {
  test('Sale ghép với biến thể: dòng hết cờ, đơn có kiện', async ({ page }) => {
    await dangNhap(page, 'sale@commerio.vn', 'sale');
    await moDonChuaGhep(page);
    await expect(dongChuaGhep(page)).toContainText('Chưa ghép SKU');
    await expect(page.locator('[data-testid=order-packages] tbody tr')).toHaveCount(0);
    await nutGhep(page).click();
    await chonVaLuu(page, null);
    await toast(page, `Đã ghép ${SKU_CU} với`);
    await expect(dongChuaGhep(page)).toHaveCount(0);
    await expect(page.locator('[data-testid=order-lines]')).not.toContainText('Chưa ghép SKU');
    await expect(page.locator('[data-testid=order-packages] tbody tr')).toHaveCount(1);
  });

  test('Sale chọn "Không quản tồn": chờ CEO duyệt, đơn giữ cờ, hết nút ghép', async ({ page }) => {
    await dangNhap(page, 'sale@commerio.vn', 'sale');
    await moDonChuaGhep(page);
    await nutGhep(page).click();
    await expect(page.getByRole('dialog')).toContainText('Cần CEO duyệt');
    await chonVaLuu(page, /Không quản tồn/);
    await toast(page, `Đã gửi CEO duyệt ghép SKU sàn ${SKU_CU}`);
    await expect(dongChuaGhep(page)).toContainText('Chưa ghép SKU');
    await expect(dongChuaGhep(page).locator('[data-testid=pending-mapping]')).toHaveText('Chờ CEO duyệt');
    await expect(nutGhep(page)).toHaveCount(0);
    await dongChuaGhep(page).locator('[data-testid=pending-mapping]').focus();
    await expect(page.getByRole('tooltip')).toContainText('xin ghép với Không quản tồn');
  });

  test('CEO chọn "Không quản tồn": áp ngay, dòng thành Không quản tồn', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await moDonChuaGhep(page);
    await nutGhep(page).click();
    await expect(page.getByRole('dialog')).toContainText('Áp ngay (ghi là tự duyệt)');
    await chonVaLuu(page, /Không quản tồn/);
    await toast(page, `Đã đặt SKU sàn ${SKU_CU} là không quản tồn`);
    await expect(dongChuaGhep(page)).toHaveCount(0);
    await expect(page.locator('[data-testid=order-lines]')).toContainText('Không quản tồn');
    await expect(page.locator('[data-testid=order-packages] tbody tr')).toHaveCount(1);
  });
});
