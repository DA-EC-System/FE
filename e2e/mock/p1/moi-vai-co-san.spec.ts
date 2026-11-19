// P1 · Admin mời, gán được vai có sẵn Sale, Nhân viên kho; câu báo khi lời mời, nhân viên sai trạng thái
// (FE#300; commerio-backend#351, #353)
import { type Page } from '@playwright/test';
import { chua, dangNhap, expect, menu, mockApi, test, toast } from '../../fixtures';

const SALE = '00000000-0000-4000-8000-000000000003';
const KHO = '00000000-0000-4000-8000-000000000004';
const dongCo = (page: Page, text: string) => chua(page, text, 'tbody tr[data-row-id]');
const role = (id: string, name: string, builtIn: boolean, permissions: string[]) => ({
  id, name, builtIn, permissions, memberCount: 0, version: 1, updatedAt: '2026-01-01T00:00:00.000Z',
});

test.describe('P1 · Mời nhân viên: vai có sẵn và sai trạng thái', () => {
  test('Admin: vai Sale, Nhân viên kho chọn được; vai tự tạo thiếu quyền ghi tên quyền thiếu', async ({ page }) => {
    await dangNhap(page, 'admin@commerio.vn', 'admin');
    await mockApi(page, 'get', '/identity/roles', 200, [
      role('role-ceo', 'CEO', true, ['platform.module.manage']),
      role(SALE, 'Sale', true, ['sales.order.view', 'inventory.cost.view']),
      role(KHO, 'Kho', true, ['inventory.stock.view', 'inventory.cost.view']),
      role('role-kt', 'Kế toán kho', false, ['inventory.stock.view', 'inventory.cost.view']),
    ]);
    await menu(page, 'Nhân viên');
    await page.getByRole('button', { name: 'Mời nhân viên', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator(`#role-${SALE}`)).toBeEnabled();
    await expect(dialog.locator(`#role-${KHO}`)).toBeEnabled();
    await expect(dialog.locator('#role-role-kt')).toBeDisabled();
    await expect(dialog.getByTestId('role-note-role-kt')).toHaveText(
      'Vai trò này có quyền bạn chưa có (Xem giá vốn, giá trị tồn). Nhờ CEO tạo link hoặc gán vai này.',
    );

    // MSW: vai Kho có sẵn tạo link được dù Admin thiếu quyền của vai (BE#351)
    await dialog.locator(`#role-${KHO}`).click();
    await dialog.getByRole('button', { name: 'Tạo link mời', exact: true }).click();
    await expect(dialog.getByRole('textbox', { name: 'Link mời' })).toHaveValue(/\/tham-gia#mock-/);
  });

  test('invalid_transition: câu theo trạng thái hiện tại ở Chờ duyệt, Link đã tạo, danh sách nhân viên', async ({ page }) => {
    await dangNhap(page, 'ceo@commerio.vn', 'ceo');
    await menu(page, 'Nhân viên');
    await expect(page.locator('tbody tr[data-row-id]').nth(1)).toBeAttached();

    // Khoá người vừa bị người khác khoá
    await mockApi(page, 'post', '/identity/staff/:id/lock', 409, {
      status: 409, title: 'Conflict', code: 'invalid_transition',
      current: { accountId: 'x', email: 'moi@commerio.vn', fullName: 'Đỗ Mới Vào', roles: [], status: 'locked', isCeo: false, version: 9 },
    });
    await dongCo(page, 'Đỗ Mới Vào').getByRole('button', { name: 'Tạm khoá', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Tạm khoá', exact: true }).click();
    const t1 = await toast(page, 'Đỗ Mới Vào đang bị tạm khoá rồi.');
    await expect(t1).not.toContainText('invalid_transition');

    // Chờ duyệt: duyệt link mà người được mời chưa nộp
    await page.getByRole('tab', { name: /Chờ duyệt/ }).click();
    const row = dongCo(page, 'Đỗ Thị Ứng Viên');
    await mockApi(page, 'post', '/identity/invitations/:id/approve', 409, {
      status: 409, title: 'Conflict', code: 'invalid_transition',
      current: { id: 'inv-001', status: 'open', fullName: null, email: null },
    });
    await row.getByRole('button', { name: 'Duyệt', exact: true }).click();
    await toast(page, 'Người được mời chưa gửi yêu cầu, chưa duyệt được.');
    await mockApi(page, 'post', '/identity/invitations/:id/approve', 409, {
      status: 409, title: 'Conflict', code: 'invalid_transition',
      current: { id: 'inv-001', status: 'rejected', fullName: 'Đỗ Thị Ứng Viên', email: 'ungvien@gmail.com' },
    });
    await row.getByRole('button', { name: 'Duyệt', exact: true }).click();
    await toast(page, 'Yêu cầu của Đỗ Thị Ứng Viên đã bị từ chối.');

    // Link đã tạo: huỷ link người được mời đã nộp
    await page.getByRole('tab', { name: /Link đã tạo/ }).click();
    const link = page.locator('tbody tr[data-row-id="inv-003"]');
    await mockApi(page, 'post', '/identity/invitations/:id/revoke', 409, {
      status: 409, title: 'Conflict', code: 'invalid_transition',
      current: { id: 'inv-003', status: 'pending', fullName: 'A', email: 'a@x.vn' },
    });
    await link.getByRole('button', { name: 'Huỷ link', exact: true }).click();
    await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: 'Huỷ link', exact: true }).click();
    await toast(page, 'Người được mời đã nộp yêu cầu. Duyệt hoặc từ chối ở tab Chờ duyệt.');
  });
});
