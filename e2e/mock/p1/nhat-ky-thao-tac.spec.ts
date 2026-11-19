// Nhật ký thao tác ghi rõ thao tác và người bị tác động (FE#298, commerio-backend#352)
import { chua, dangNhap, expect, menu, test, toast } from '../../fixtures';

test.describe('Nhật ký thao tác: nhãn theo thao tác', () => {
  test('tạm khoá nhân viên hiện "Tạm khoá · Nhân viên · Họ tên (email)"', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await menu(page, 'Nhân viên');
    await chua(page, 'Đỗ Mới Vào', 'tbody tr').getByRole('button', { name: 'Tạm khoá', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Tạm khoá', exact: true }).click();
    await toast(page, 'Đã tạm khoá Đỗ Mới Vào');

    await menu(page, 'Nhật ký thao tác');
    const dong = page.locator('tbody tr[data-row-id]').first();
    await expect(dong.getByTestId('audit-operation')).toHaveText('Tạm khoá');
    await expect(dong).toContainText('Nhân viên');
    await expect(dong).toContainText('Đỗ Mới Vào (moi@commerio.vn)');

    await dong.getByRole('button', { name: 'Chi tiết' }).click();
    const hop = page.getByRole('dialog');
    await expect(hop).toContainText('Tạm khoá');
    await expect(hop.getByTestId('audit-diff')).toContainText('Đang hoạt động');
  });

  test('dòng cũ không có operation vẫn hiện Thêm/Sửa', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await menu(page, 'Nhật ký thao tác');
    await expect(chua(page, 'Chăm sóc khách hàng', 'tbody tr').getByTestId('audit-operation')).toHaveText('Thêm');
  });
});
