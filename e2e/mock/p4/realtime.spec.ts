// P4 · Realtime (FE#81): màn hình tự cập nhật khi sàn đẩy sự kiện, không bấm tải lại.
// Sự kiện phát bằng phatSuKienSan (không qua trang sàn giả lập, vì trang đó tự làm mới mọi query).
import { chua, dangNhap, duongDan, expect, phatSuKienSan, test, toast } from '../../fixtures';

test.describe('P4 · Realtime', () => {
  test.beforeEach(async ({ page }) => {
    await dangNhap(page, 'sale@commerio.vn', 'sale');
    await page.goto('/c/cmp-001/sales/orders');
    await expect(page.locator('[data-testid=realtime-status]')).toHaveAttribute('data-status', 'open');
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
});
