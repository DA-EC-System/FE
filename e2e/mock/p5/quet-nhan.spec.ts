// P5 · Quét nhận hàng về theo số lượng (FE#212): hàng hoàn, kiện thất lạc tìm thấy, hàng trả.
// Kho nhập số quét thật từng món; chờ xử lý tăng đúng số quét, phiếu kiểm hàng về mang số đó
import { type Locator, type Page } from '@playwright/test';
import { chua, dangNhap, dong, expect, menu, mockApi, test, thayChu, toast } from '../../fixtures';

const MON_LA = 'QU-0001-M';

const nutKien = (page: Page, name: string) =>
  page.locator('[data-testid=package-actions]').getByRole('button', { name, exact: true });
const trangThaiKien = (page: Page) => page.locator('[data-testid=package-status]');
const hopQuet = (page: Page) => page.getByTestId('package-scan-dialog');

/** Thêm món ngoài danh sách bằng tìm SKU trong bảng quét */
const themMon = async (page: Page, khung: Locator, id: string, sku: string) => {
  await khung.locator(`#${id}-add`).click();
  await khung.locator(`#${id}-add`).fill(sku);
  await chua(page, sku, '[role=option]').click();
};

/** Số chờ xử lý của một SKU ở danh sách tồn kho */
const choXuLy = async (page: Page, sku: string) => {
  await menu(page, 'Kho');
  const row = page.locator('tbody tr', { hasText: sku }).first();
  await expect(row).toBeAttached();
  const chips = (await row.getByTestId('stock-chips').textContent()) ?? '';
  return Number(/Chờ xử lý (\d+)/.exec(chips)?.[1] ?? 0);
};

/** Mở phiếu kiểm hàng về mới nhất */
const moPhieuKiemMoiNhat = async (page: Page) => {
  await menu(page, 'Kho');
  await page.getByRole('tab', { name: 'Phiếu kho', exact: true }).click();
  await chua(page, 'KHV-000003', 'tr').click();
  return page.getByTestId('doc-lines');
};

/** Chuyển trang trong SPA, không tải lại (tải lại là mất dữ liệu mock) */
const diToi = (page: Page, url: string) =>
  page.evaluate((url) => {
    window.history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, url);

const KIEN = '/c/cmp-001/fulfillment/packages/pkg-1016';

/** Kiện pkg-1016 đang giao: cập nhật giao "Hoàn về" từ đơn ord-1016, rồi mở trang kiện */
const hoanVe = async (page: Page) => {
  await diToi(page, '/c/cmp-001/sales/orders/ord-1016');
  await page.locator('[data-testid=order-packages] tbody tr').first().getByRole('button', { name: 'Cập nhật giao', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Hoàn về', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await diToi(page, KIEN);
  await expect(trangThaiKien(page)).toContainText('Đang hoàn');
};

/** Kho (acc-003) báo thất lạc kiện qua API, để CEO là người thứ hai xác nhận */
const khoBaoThatLac = (page: Page) =>
  page.evaluate(async () => {
    const headers = { Authorization: `Bearer mock.acc-003.cmp-001.${Date.now()}`, 'Content-Type': 'application/json' };
    const url = '/api/v1/fulfillment/packages/pkg-1016';
    const p = (await (await fetch(url, { headers })).json()) as { version: number };
    const r = await fetch(`${url}/report-lost`, { method: 'POST', headers, body: JSON.stringify({ claimCode: 'KN-212', version: p.version }) });
    return r.status;
  });

test.describe('P5 · Quét nhận hàng về theo số lượng', () => {
  test.describe('kiện hàng hoàn', () => {
    test.beforeEach(({ page }) => dangNhap(page, 'ceo@commerio.vn', 'ceo'));

    test('quét thiếu và có món lạ: phiếu kiểm có dòng thiếu, dòng dự kiến 0, chờ xử lý tăng đúng số quét', async ({ page }) => {
      const truoc = await choXuLy(page, MON_LA);
      await hoanVe(page);
      await nutKien(page, 'Quét nhận hàng hoàn').click();
      const dialog = hopQuet(page);
      const bang = dialog.getByTestId('scan-lines');
      const dongDau = bang.locator('tbody tr').first();
      const sku = (await dongDau.getAttribute('data-row-id')) ?? '';
      // Mặc định quét đủ theo kiện
      await expect(dongDau.getByLabel(`Số quét ${sku}`, { exact: true })).not.toHaveValue('');

      // Chặn trước khi gửi: thiếu mã, số âm
      await dongDau.getByLabel(`Số quét ${sku}`, { exact: true }).fill('-1');
      await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
      await thayChu(dialog, 'Quét hoặc nhập mã');
      await thayChu(dongDau, 'Số lượng là số nguyên không âm');

      // Không thấy món của kiện: 0; thêm món lạ, không chọn lại món đã có
      await dongDau.getByLabel(`Số quét ${sku}`, { exact: true }).fill('0');
      await themMon(page, dialog, 'scan-lines', MON_LA);
      const dongLa = bang.locator(`tbody tr[data-row-id="${MON_LA}"]`);
      await expect(dongLa).toContainText('Ngoài danh sách');
      await dongLa.getByLabel(`Số quét ${MON_LA}`, { exact: true }).fill('2');
      await dialog.locator('#scan-lines-add').fill(MON_LA);
      await expect(chua(page, MON_LA, '[role=option]')).toHaveAttribute('aria-disabled', 'true');
      await page.keyboard.press('Escape');

      // Lỗi từng dòng của BE hiện đúng dòng, giữ nguyên câu
      await dialog.locator('#package-code-input').fill('KH-000017');
      await mockApi(page, 'post', '/fulfillment/packages/pkg-1016/receive-return', 422, {
        status: 422,
        title: 'Dữ liệu không hợp lệ',
        errors: { 'lines.1.variantId': 'Biến thể bị lặp' },
      });
      await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
      await thayChu(dongLa, 'Biến thể bị lặp');

      await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
      await toast(page, 'Đã nhận hàng hoàn KH-000017');
      await expect(trangThaiKien(page)).toContainText('Đã hoàn về');

      const lines = await moPhieuKiemMoiNhat(page);
      const thieu = lines.locator('tbody tr').first();
      await expect(thieu.getByLabel(`Số quét ${sku}`, { exact: true })).toHaveValue('0');
      // Cột Thiếu: dự kiến 1, quét 0
      await expect(thieu.locator('td').nth(6)).toHaveText('1');
      const saiMau = lines.locator('tbody tr', { hasText: MON_LA });
      await expect(saiMau).toContainText('Sai mẫu');
      await expect(saiMau.getByLabel(`Số quét ${MON_LA}`, { exact: true })).toHaveValue('2');
      await expect(saiMau.locator('td').nth(1)).toHaveText('0');

      expect(await choXuLy(page, MON_LA)).toBe(truoc + 2);
    });
  });

  test('kiện thất lạc tìm thấy: hỏi số quét trước khi nhận', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    expect(await khoBaoThatLac(page)).toBe(200);
    await diToi(page, KIEN);
    await nutKien(page, 'Xác nhận thất lạc').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Xác nhận thất lạc', exact: true }).click();
    await expect(trangThaiKien(page)).toContainText('Thất lạc');

    await nutKien(page, 'Tìm thấy').click();
    const hop = hopQuet(page);
    await thayChu(hop, 'Nhận kiện tìm thấy KH-000017');
    // Không cần mã: chỉ có bảng số quét
    await expect(hop.locator('#package-code-input')).toHaveCount(0);
    await expect(hop.getByTestId('scan-lines').locator('tbody tr')).toHaveCount(1);
    await hop.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await toast(page, 'Đã nhận kiện tìm thấy KH-000017');
    await expect(trangThaiKien(page)).toContainText('Đã hoàn về');
  });

  test.describe('hàng trả', () => {
    test.beforeEach(async ({ page }) => {
      await dangNhap(page, 'kho@commerio.vn', 'kho');
      await menu(page, 'Yêu cầu trả');
      await page.getByRole('button', { name: 'Quét nhận hàng trả', exact: true }).click();
    });

    test('mã khớp yêu cầu thì hiện dòng của yêu cầu; quét thiếu lập phiếu kiểm có dòng thiếu', async ({ page }) => {
      const dialog = page.getByRole('dialog');
      await dialog.getByTestId('receive-code').fill('YCT-000002');
      await thayChu(dialog.getByTestId('receive-match'), 'Khớp yêu cầu YCT-000002 (đơn DH-1019)');
      const dongDau = dialog.getByTestId('receive-lines').locator('tbody tr').first();
      const sku = (await dongDau.getAttribute('data-row-id')) ?? '';
      await expect(dongDau.getByLabel(`Số quét ${sku}`, { exact: true })).toHaveValue('1');
      await dongDau.getByLabel(`Số quét ${sku}`, { exact: true }).fill('1.5');
      await dialog.getByRole('button', { name: 'Nhận hàng', exact: true }).click();
      await thayChu(dongDau, 'Số lượng là số nguyên không âm');
      await dongDau.getByLabel(`Số quét ${sku}`, { exact: true }).fill('0');
      await dialog.getByRole('button', { name: 'Nhận hàng', exact: true }).click();
      await toast(page, 'Đã nhận hàng trả YCT-000002, phiếu kiểm hàng về đã lập');

      const lines = await moPhieuKiemMoiNhat(page);
      await expect(lines.locator('tbody tr').first().getByLabel(`Số quét ${sku}`, { exact: true })).toHaveValue('0');
    });

    test('mã không khớp: kho thêm món bằng tìm SKU, kiện vào khu chờ xử lý', async ({ page }) => {
      const dialog = page.getByRole('dialog');
      await dialog.getByTestId('receive-code').fill('VD-LA-212');
      await thayChu(dialog.getByTestId('receive-match'), 'Chưa thấy yêu cầu chờ hàng về khớp mã này');
      await themMon(page, dialog, 'receive-lines', MON_LA);
      await expect(dong(page, MON_LA)).toContainText('Ngoài danh sách');
      await dialog.getByRole('button', { name: 'Nhận hàng', exact: true }).click();
      await toast(page, 'Mã VD-LA-212 không khớp yêu cầu nào, kiện vào khu chờ xử lý');
    });
  });
});
