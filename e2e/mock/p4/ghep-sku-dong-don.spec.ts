// P4 · Ghép SKU từ dòng đơn trên trang chi tiết đơn (sơ đồ D1; FE#283, commerio-backend#237) và link tới trang gian hàng (FE#327)
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

test.describe('Dòng chưa ghép dẫn tới trang gian hàng (FE#327)', () => {
  test('bấm tên sản phẩm: đúng gian hàng, tab Chưa ghép, ô tìm, hộp ghép tự mở; ghép xong quay lại đơn', async ({ page }) => {
    await dangNhap(page, 'sale@commerio.vn', 'sale');
    const code = await moDonChuaGhep(page);
    await page.getByTestId('line-shop-link').click();
    await expect(page).toHaveURL(/\/channel\/shops\/shp-001\?/);
    await expect(page.getByTestId('listing-tab-unmatched')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByPlaceholder('Tìm theo tên, SKU hoặc SKU sàn...')).toHaveValue(SKU_CU);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Ghép SKU sàn với biến thể' })).toBeVisible();
    await expect(page).not.toHaveURL(/match=/);
    await expect(page.getByTestId('back-to-order')).toHaveText(`Đơn ${code}`);
    await dialog.getByRole('radio').first().check();
    await dialog.getByRole('button', { name: 'Lưu ghép', exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: `Quay lại đơn ${code}`, exact: true }).click();
    await expect(page.getByRole('heading', { name: `Đơn ${code}` })).toBeVisible();
    await expect(dongChuaGhep(page)).toHaveCount(0);
    await expect(page.getByTestId('line-shop-link')).toHaveCount(0);
  });

  test('mở thẳng link: đúng tab, ô tìm; đổi tab thì URL đổi; SKU không có trong bản sao thì nhắc Tải lại', async ({ page }) => {
    await dangNhap(page, 'sale@commerio.vn', 'sale');
    await page.goto('/c/cmp-001/channel/shops/shp-001?tab=unmatched&q=KHONG-CO&match=sku-khong-co');
    await expect(page.getByTestId('listing-tab-unmatched')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByPlaceholder('Tìm theo tên, SKU hoặc SKU sàn...')).toHaveValue('KHONG-CO');
    await expect(page.getByTestId('match-missing')).toHaveText(
      'Chưa thấy SKU sàn KHONG-CO trong danh sách. Bấm Tải lại để lấy SKU mới từ sàn.',
    );
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByTestId('listing-tab-failed').click();
    await expect(page).toHaveURL(/tab=failed/);
    await page.getByPlaceholder('Tìm theo tên, SKU hoặc SKU sàn...').fill('');
    await expect(page).not.toHaveURL(/[?&]q=/);
  });
});
