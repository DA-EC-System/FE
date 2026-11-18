// P4 · Danh sách đơn: nút Đồng bộ đơn và bảng toàn màn hình
import { chon, dangNhap, expect, menu, test, toast } from '../../fixtures';

test.describe('P4 · Đồng bộ đơn và toàn màn hình', () => {
  test('đồng bộ đơn kéo mọi gian hàng đang hoạt động; lọc gian hàng thì chỉ kéo gian hàng đó', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await menu(page, 'Đơn hàng');

    const keo: string[] = [];
    page.on('request', (r) => {
      const m = /\/channel\/shops\/([^/]+)\/orders\/pull$/.exec(new URL(r.url()).pathname);
      if (m && r.method() === 'POST') keo.push(m[1]);
    });

    await page.getByRole('button', { name: 'Đồng bộ đơn', exact: true }).click();
    await toast(page, 'Đã đồng bộ 2 gian hàng: 0 đơn mới, 0 đơn cập nhật');
    // Gian hàng cần kết nối lại không bị gọi
    expect(keo).toHaveLength(2);

    keo.length = 0;
    await chon(page, 'Gian hàng', 'ABC Fashion LazMall');
    await page.getByRole('button', { name: 'Đồng bộ đơn gian hàng', exact: true }).click();
    await toast(page, /Đã đồng bộ 1 gian hàng/);
    expect(keo).toHaveLength(1);
  });

  test('sale không có quyền đồng bộ thì không thấy nút', async ({ page }) => {
    await dangNhap(page, 'sale@commerio.vn', 'sale');
    await menu(page, 'Đơn hàng');
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('button', { name: /Đồng bộ đơn/ })).toHaveCount(0);
  });

  test('bảng toàn màn hình phủ cửa sổ, Esc hoặc bấm lại để thoát', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await menu(page, 'Đơn hàng');
    const the = page.locator('[data-guide="order-list"]');
    const vp = page.viewportSize()!;

    await page.getByRole('button', { name: 'Toàn màn hình', exact: true }).click();
    await expect(the).toHaveAttribute('data-fullscreen', 'true');
    const box = (await the.boundingBox())!;
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(Math.round(box.width)).toBe(vp.width);

    // Mở rồi đóng ô chọn bằng Esc: vẫn ở toàn màn hình
    await page.getByRole('combobox', { name: 'Nguồn', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(the).toHaveAttribute('data-fullscreen', 'true');

    await page.keyboard.press('Escape');
    await expect(the).not.toHaveAttribute('data-fullscreen');

    await page.getByRole('button', { name: 'Toàn màn hình', exact: true }).click();
    await page.getByRole('button', { name: 'Thoát toàn màn hình', exact: true }).click();
    await expect(the).not.toHaveAttribute('data-fullscreen');
  });
});
