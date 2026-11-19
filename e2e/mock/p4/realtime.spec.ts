// P4 · Realtime (FE#81): màn hình tự cập nhật khi sàn đẩy sự kiện, không bấm tải lại.
// Sự kiện phát bằng phatSuKienSan (không qua trang sàn giả lập, vì trang đó tự làm mới mọi query).
import { type Page } from '@playwright/test';
import { chua, dangNhap, dong, duongDan, expect, phatRealtime, phatSuKienSan, test, toast } from '../../fixtures';

test.describe('P4 · Realtime', () => {
  test.beforeEach(async ({ page }) => {
    await dangNhap(page, 'sale@commerio.vn', 'sale');
    await page.goto('/c/cmp-001/sales/orders');
    await expect(page.locator('[data-testid=realtime-status]')).toHaveAttribute('data-stream', 'open');
  });

  test('đơn mới từ sàn tự hiện trên danh sách đang mở, có thông báo', async ({ page }) => {
    await expect(page.locator('tbody tr')).not.toHaveCount(0);
    const message = await phatSuKienSan(page, 'order.created', 'shp-001');
    const code = message.split(':')[0]!;
    await expect(chua(page, code, 'tbody tr')).toBeAttached();
    await toast(page, `Có đơn mới ${code}`);
  });

  test('bấm Xem trên thông báo mở đơn; khách trả tiền thì chi tiết tự đổi trạng thái', async ({ page }) => {
    const message = await phatSuKienSan(page, 'order.created', 'shp-001');
    const code = message.split(':')[0]!;
    await (await toast(page, `Có đơn mới ${code}`)).getByRole('button', { name: 'Xem', exact: true }).click();
    await expect.poll(() => duongDan(page)).toMatch(/\/sales\/orders\/ord-/);
    await expect(page.locator('[data-testid=order-status]')).toContainText('Chưa thanh toán');

    await phatSuKienSan(page, 'order.paid', undefined, { code });
    await expect(page.locator('[data-testid=order-status]')).toContainText('Đang xử lý');
  });

  test('Sale: kiện giao thất bại có thông báo, Xem mở đơn (Sale không mở được trang kiện)', async ({ page }) => {
    await phatRealtime(page, 'fulfillment.package_delivery_failed', {
      packageId: 'pkg-1016',
      orderId: 'ord-1016',
      reason: 'Khách không nghe máy',
    });
    const t = await toast(page, 'Một kiện giao không thành công: Khách không nghe máy');
    await t.getByRole('button', { name: 'Xem', exact: true }).click();
    await expect.poll(() => duongDan(page)).toBe('/c/cmp-001/sales/orders/ord-1016');
  });
});

// FE#287 (commerio-backend#216, Documents/21 §13.2, §11.2): hàng đợi kiện, trang kiện, yêu cầu trả tự cập nhật; thông báo
// kiện giao thất bại, thất lạc.
test.describe('P4 · Realtime kiện, yêu cầu trả (CEO)', () => {
  const trangThaiKien = (page: Page) => page.locator('[data-testid=package-status]');

  test.beforeEach(async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await page.goto('/c/cmp-001/fulfillment/packages');
    await expect(page.locator('[data-testid=realtime-status]')).toHaveAttribute('data-stream', 'open');
  });

  test('sàn báo đang giao rồi giao thất bại: hàng đợi tự đổi, thông báo có mã kiện, Xem mở trang kiện đã đổi', async ({ page }) => {
    await page.getByRole('tab', { name: /Chờ lấy hàng/ }).click();
    const row = dong(page, 'pkg-1015');
    await expect(row).toBeVisible();
    const code = ((await row.textContent()) ?? '').match(/KH-\d{6}/)![0];
    // Mở kiện rồi quay lại để mã kiện có trong cache, như người dùng vừa xem kiện
    await row.click();
    await expect(trangThaiKien(page)).toContainText('Chờ lấy hàng');
    await page.goBack();
    await expect(dong(page, 'pkg-1015')).toBeVisible();

    // Sàn báo kiện đã rời kho: hàng đợi Chờ lấy hàng tự bớt kiện, không tải lại trang
    await page.evaluate(() => ((window as unknown as { __marker?: number }).__marker = 287));
    await phatSuKienSan(page, 'package.shipping_update', undefined, { target: `${code} in_transit` });
    await expect(dong(page, 'pkg-1015')).toHaveCount(0);
    await page.getByRole('tab', { name: /Đang vận chuyển/ }).click();
    await expect(dong(page, 'pkg-1015')).toBeVisible();

    await phatSuKienSan(page, 'package.shipping_update', undefined, { target: `${code} delivery_failed` });
    await expect(dong(page, 'pkg-1015')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(287);
    const t = await toast(page, `Kiện ${code} giao không thành công: Sàn báo giao không thành công`);
    await t.getByRole('button', { name: 'Xem', exact: true }).click();
    await expect.poll(() => duongDan(page)).toBe('/c/cmp-001/fulfillment/packages/pkg-1015');
    await expect(trangThaiKien(page)).toContainText('Giao thất bại');
  });

  test('kiện thất lạc: thông báo kèm mã khiếu nại, Xem mở trang kiện; không có mã thì không kèm', async ({ page }) => {
    await phatRealtime(page, 'fulfillment.package_lost', { packageId: 'pkg-1016', orderId: 'ord-1016', claimCode: 'KN-287' });
    const t = await toast(page, 'Một kiện thất lạc, mã khiếu nại KN-287');
    await t.getByRole('button', { name: 'Xem', exact: true }).click();
    await expect.poll(() => duongDan(page)).toBe('/c/cmp-001/fulfillment/packages/pkg-1016');
    await phatRealtime(page, 'fulfillment.package_lost', { packageId: 'pkg-1010', orderId: 'ord-1010', claimCode: null });
    await expect(chua(page, /^Một kiện thất lạc(Xem)?$/, '[data-sonner-toast]')).toBeAttached();
  });

  test('yêu cầu trả: sàn đẩy yêu cầu mới thì danh sách đang mở tự hiện, số ở tab Chờ phản hồi tăng', async ({ page }) => {
    await page.goto('/c/cmp-001/sales/returns');
    await expect(page.getByRole('tab', { name: /Chờ phản hồi/ })).toContainText('1');
    await expect(chua(page, 'YCT-000003', 'tr')).toHaveCount(0);
    await phatSuKienSan(page, 'return.requested', undefined, { target: 'DH-1015' });
    await expect(chua(page, 'YCT-000003', 'tr')).toContainText('DH-1015');
    await expect(page.getByRole('tab', { name: /Chờ phản hồi/ })).toContainText('2');
  });
});
