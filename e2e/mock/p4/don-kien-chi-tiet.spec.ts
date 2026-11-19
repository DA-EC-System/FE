// P4 · Kiện chờ mở, thất lạc (FE#284, commerio-backend#238); chi tiết đơn: hoàn tất, người huỷ (FE#282); nhãn dòng, trễ hạn (FE#252)
import { type Page } from '@playwright/test';
import { dangNhap, dong, expect, menu, phatSuKienSan, test, thayChu, toast } from '../../fixtures';

const trangThaiKien = (page: Page) => page.locator('[data-testid=package-status]');
const canhBao = (page: Page) => page.locator('[data-testid=package-warnings]');
const nutKien = (page: Page, name: string) =>
  page.locator('[data-testid=package-actions]').getByRole('button', { name, exact: true });

/** Mở kiện ở tab Chờ lấy hàng của hàng đợi (đi bằng click: dữ liệu mock mất khi tải lại trang); trả về mã kiện */
async function moKienChoLay(page: Page, id: string, suKien?: string) {
  await menu(page, 'Kiện hàng');
  await page.getByRole('tab', { name: /Chờ lấy hàng/ }).click();
  const ma = /KH-\d{6}/.exec((await dong(page, id).textContent()) ?? '')?.[0] ?? '';
  expect(ma).not.toBe('');
  const msg = suKien ? await phatSuKienSan(page, suKien, undefined, { code: ma }) : '';
  await dong(page, id).click();
  await expect(trangThaiKien(page)).toContainText('Chờ lấy hàng');
  return { ma, msg };
}

test.describe('P4 · Kiện chờ mở, thất lạc (FE#284)', () => {
  test.beforeEach(async ({ page }) => {
    await dangNhap(page, 'kho@commerio.vn', 'kho');
  });

  test('sàn chia lại kiện: kiện cũ chờ mở, kiện thay chờ mở kiện cũ; mở kiện cũ giữ vận đơn và huỷ kiện cũ', async ({ page }) => {
    const { ma, msg } = await moKienChoLay(page, 'pkg-1015', 'package.platform_resplit');
    const thay = /kiện thay (KH-\d+)/.exec(msg)?.[1] ?? '';
    expect(thay).not.toBe('');
    await expect(trangThaiKien(page)).toContainText('Chờ mở kiện');
    await expect(canhBao(page)).toContainText('Cần mở lại kiện: Chia lại kiện');
    await expect(canhBao(page)).toContainText('Kiện đang chờ mở: mở kiện xong mới báo sẵn sàng hay bàn giao được.');
    await expect(nutKien(page, 'Bàn giao')).toHaveCount(0);
    await expect(nutKien(page, 'Mở kiện')).toBeVisible();

    // Kiện thay: có link về kiện cũ (đóng gói xong mới chặn báo sẵn sàng, xem shared.test)
    await menu(page, 'Kiện hàng');
    await page.getByRole('tab', { name: /Cần đóng gói/ }).click();
    await page.locator('tbody tr', { hasText: thay }).first().click();
    await expect(page.locator('[data-testid=package-replaces]')).toContainText(ma);

    // Về kiện cũ bằng link, mở kiện: giữ vận đơn, không lấy mã mới
    await page.locator('[data-testid=package-replaces]').getByRole('link', { name: ma }).click();
    await nutKien(page, 'Mở kiện').click();
    const alert = page.getByRole('alertdialog');
    await thayChu(alert, 'giữ nguyên vận đơn');
    await alert.getByRole('button', { name: 'Mở kiện', exact: true }).click();
    await expect(trangThaiKien(page)).toContainText('Đã huỷ');
    await expect(page.locator('[data-testid=status-history]')).toContainText(`Hàng chuyển sang kiện ${thay}`);
  });

  test('kiểm kê thiếu: kiện Chờ lấy hàng mở được, nhãn Kiểm kê thiếu hàng', async ({ page }) => {
    await moKienChoLay(page, 'pkg-1015', 'package.stocktake_short');
    await expect(canhBao(page)).toContainText('Cần mở lại kiện: Kiểm kê thiếu hàng');
    await expect(nutKien(page, 'Mở kiện')).toBeVisible();
    await expect(nutKien(page, 'Bàn giao')).toHaveCount(0);
  });

  test('kiện Chờ lấy hàng không chờ mở: không có Mở kiện, không báo mất', async ({ page }) => {
    await moKienChoLay(page, 'pkg-1015');
    await expect(nutKien(page, 'Bàn giao')).toBeVisible();
    await expect(nutKien(page, 'Mở kiện')).toHaveCount(0);
    await expect(nutKien(page, 'Báo không thấy kiện')).toHaveCount(0);
    await expect(nutKien(page, 'Báo thất lạc')).toHaveCount(0);
  });

  test('dỡ kiện chờ mở không thấy: kho báo, cần người khác xác nhận', async ({ page }) => {
    const { ma } = await moKienChoLay(page, 'pkg-1015', 'package.stocktake_short');
    await nutKien(page, 'Báo không thấy kiện').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await thayChu(dialog, 'Nhập ghi chú');
    await dialog.getByLabel('Ghi chú (vd: không thấy trên kệ)', { exact: true }).fill('Không thấy trên kệ');
    await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await toast(page, `Đã báo thất lạc ${ma}`);
    await expect(canhBao(page)).toContainText('báo dỡ kiện không thấy');
    await expect(page.locator('[data-testid=lost-note]')).toHaveText('Bạn là người báo nên cần một người khác xác nhận.');
    await expect(nutKien(page, 'Dỡ kiện không thấy')).toHaveCount(0);
  });
});

test.describe('P4 · Thất lạc tự duyệt (FE#284)', () => {
  test('CEO báo và tự xác nhận dỡ kiện không thấy, ghi là tự duyệt', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await moKienChoLay(page, 'pkg-1015', 'package.stocktake_short');
    await nutKien(page, 'Báo không thấy kiện').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Ghi chú (vd: không thấy trên kệ)', { exact: true }).fill('Không thấy trên kệ');
    await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await expect(page.locator('[data-testid=lost-note]')).toHaveText('Bạn là người báo. Xác nhận sẽ ghi là tự duyệt.');
    await nutKien(page, 'Dỡ kiện không thấy').click();
    const alert = page.getByRole('alertdialog');
    await thayChu(alert, 'Hàng trong kiện được ghi là đã rời kho');
    await alert.getByRole('button', { name: 'Xác nhận thất lạc', exact: true }).click();
    await expect(trangThaiKien(page)).toContainText('Thất lạc');
  });

  test('sàn báo thất lạc: kiện sang Thất lạc, ghi Sàn báo', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await menu(page, 'Kiện hàng');
    await page.getByRole('tab', { name: /Chờ lấy hàng/ }).click();
    const ma = /KH-\d{6}/.exec((await dong(page, 'pkg-1015').textContent()) ?? '')?.[0] ?? '';
    await phatSuKienSan(page, 'package.shipping_update', undefined, { target: `${ma} in_transit` });
    await phatSuKienSan(page, 'package.shipping_update', undefined, { target: `${ma} lost` });
    // Kiện Thất lạc không còn ở hàng đợi: mở qua đơn
    await menu(page, 'Đơn hàng');
    await page.locator('tbody tr', { hasText: 'DH-1015' }).first().click();
    await page.locator('a[href$="/fulfillment/packages/pkg-1015"]').first().click();
    await expect(trangThaiKien(page)).toContainText('Thất lạc');
    await expect(canhBao(page)).toContainText('Sàn báo kiện thất lạc');
  });
});
