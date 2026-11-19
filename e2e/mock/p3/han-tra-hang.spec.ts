// P3 · Gian hàng: sửa hạn trả hàng, nhãn "Chưa nhập số ngày hạn trả" (FE#273; Documents/21 §18.4, §18.7.2)
import { dangNhap, dong, duongDan, expect, menu, mockApi, test, toast } from '../../fixtures';

const shopPath = (path: string) => path.match(/^\/c\/[^/]+/)![0] + '/channel/shops';

test.describe('P3 · Hạn trả hàng của gian hàng', () => {
  test('Kênh bán: nhãn Cần xử lý → nhập 7 ngày → nhãn mất, GET trả 7', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await menu(page, 'Kênh bán');
    // shp-003 Lazada (returnWindow = days) chưa có số ngày
    const nhan = dong(page, 'shp-003').getByTestId('shop-missing-return-window');
    await expect(nhan).toHaveText('Chưa nhập số ngày hạn trả');
    // Sàn tự báo hạn trả (Shopee, TikTok) không có nhãn
    await expect(dong(page, 'shp-001').getByTestId('shop-missing-return-window')).toHaveCount(0);
    await expect(dong(page, 'shp-002').getByTestId('shop-missing-return-window')).toHaveCount(0);

    await nhan.click();
    await expect.poll(() => duongDan(page)).toMatch(/\/channel\/shops\/shp-003$/);
    const o = page.getByLabel('Hạn trả hàng (ngày)');
    await expect(o).toBeFocused();

    // Kiểm ở FE: ngoài 1–60 không gửi
    await o.fill('61');
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(page.locator('#return-window-days-error')).toHaveText('Số ngày đổi trả là số nguyên từ 1 đến 60');

    await o.fill('7');
    const gui = page.waitForRequest((r) => r.method() === 'PATCH' && /\/channel\/shops\/shp-003$/.test(r.url()));
    // Lưu xong thì đọc lại gian hàng: GET trả returnWindowDays 7
    const docLai = page.waitForResponse((r) => r.request().method() === 'GET' && /\/channel\/shops\/shp-003$/.test(r.url()));
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    expect((await gui).postDataJSON()).toEqual({ version: expect.any(Number), returnWindowDays: 7 });
    expect((await (await docLai).json()).returnWindowDays).toBe(7);
    await toast(page, 'Đã lưu hạn trả hàng 7 ngày');
    await expect(page.getByTestId('return-window-missing')).toHaveCount(0);
    await expect(page.getByTestId('return-window-days')).toHaveText('7 ngày');
    expect(new URL(page.url()).search).toBe('');

    await page.goto(shopPath(duongDan(page)));
    await expect(dong(page, 'shp-003').getByTestId('shop-missing-return-window')).toHaveCount(0);
  });

  test('422 hiện lỗi dưới ô, 409 nạp lại số mới và báo người khác vừa sửa', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    const tai = page.waitForResponse((r) => r.request().method() === 'GET' && /\/channel\/shops\/shp-003$/.test(r.url()));
    await page.goto(`${shopPath(duongDan(page))}/shp-003?sua=han-tra`);
    const current = await (await tai).json();
    const o = page.getByLabel('Hạn trả hàng (ngày)');
    await o.fill('10');

    await mockApi(page, 'patch', '/channel/shops/shp-003', 422, {
      title: 'Dữ liệu không hợp lệ',
      status: 422,
      code: 'validation_failed',
      errors: { returnWindowDays: 'Sàn tự báo hạn trả hàng, không đặt số ngày' },
    });
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(page.locator('#return-window-days-error')).toHaveText('Sàn tự báo hạn trả hàng, không đặt số ngày');

    await mockApi(page, 'patch', '/channel/shops/shp-003', 409, {
      title: 'Dữ liệu vừa được người khác sửa',
      status: 409,
      code: 'version_conflict',
      detail: 'Gian hàng vừa được người khác sửa.',
      current: { ...current, returnWindowDays: 14, version: current.version + 1 },
    });
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(page.getByTestId('return-window-notice')).toContainText('Gian hàng vừa được người khác sửa');
    await expect(o).toHaveValue('14');
  });

  test('gian hàng TikTok không có ô hạn trả hàng', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await page.goto(`${shopPath(duongDan(page))}/shp-002`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ABC Fashion TikTok Shop');
    await expect(page.getByTestId('return-window')).toHaveCount(0);
    await expect(page.getByTestId('return-window-missing')).toHaveCount(0);
    await expect(page.getByLabel('Hạn trả hàng (ngày)')).toHaveCount(0);
  });
});
