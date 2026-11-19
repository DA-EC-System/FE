// P4 với BE thật · Kiện thất lạc và Mở kiện chờ mở (FE#284; commerio-backend#238, Documents/21 §19.2):
//   1. Kho A báo kiện Đang giao thất lạc (mã khiếu nại): kiện giữ trạng thái, A không tự xác nhận được.
//   2. Kho B xác nhận: kiện sang Thất lạc.
//   3. Kiện Chờ lấy hàng chờ mở (kiểm kê thiếu): Mở kiện giữ vận đơn, kiện về Đã giữ hàng.
//   4. Kiện Đã đóng gói chờ mở, dỡ về kệ không thấy: A báo (ghi chú), B xác nhận (lose_on_unload), kiện sang Thất lạc.
// Chạy: PW_BASE_URL=<địa chỉ FE trỏ BE thật> pnpm e2e:be e2e/be/p4/kien-that-lac.spec.ts
// Tự bỏ qua trừ khi đặt E2E_KIEN_SEED: đường dẫn tệp JSON dữ liệu đã seed, dạng
//   { companyId, password, khoA, khoB,                     // email hai tài khoản vai trò Kho cùng công ty
//     dangGiao: { id, code },                              // kiện in_transit
//     choMo: { id, code },                                 // kiện awaiting_pickup, needs_open, open_purpose stocktake
//     dongChoMo: { id, code } }                            // kiện packed, needs_open
// Mỗi kiện chỉ chạy được một lần: chạy lại cần seed mới. Seed bằng helper integration của BE (`createCompany`,
// `addMember(…, 'warehouse')`, `seedPackage` trong test/integration/order/fulfillment/helpers.ts).
import { readFileSync } from 'node:fs';
import { type Page } from '@playwright/test';
import { duongDan, expect, test, toast } from '../../fixtures';

interface Seed {
  companyId: string;
  password: string;
  khoA: string;
  khoB: string;
  dangGiao: { id: string; code: string };
  choMo: { id: string; code: string };
  dongChoMo: { id: string; code: string };
}

const SEED_PATH = process.env.E2E_KIEN_SEED ?? '';
const seed: Seed | null = SEED_PATH ? (JSON.parse(readFileSync(SEED_PATH, 'utf8')) as Seed) : null;

const trangThai = (page: Page) => page.getByTestId('package-status');
const canhBao = (page: Page) => page.getByTestId('package-warnings');
const nut = (page: Page, name: string) => page.getByTestId('package-actions').getByRole('button', { name, exact: true });

async function dangNhap(page: Page, email: string) {
  await page.goto('/login');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(seed!.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  // Tài khoản một công ty: /select-company tự chuyển vào công ty
  await expect.poll(() => duongDan(page)).toMatch(new RegExp(`^/c/${seed!.companyId}`));
}

const moKien = (page: Page, id: string) => page.goto(`/c/${seed!.companyId}/fulfillment/packages/${id}`);

test.describe.configure({ mode: 'serial' });

test.describe('P4-BE · Kiện thất lạc, Mở kiện chờ mở (FE#284)', () => {
  test.skip(!seed, 'Thiếu E2E_KIEN_SEED');

  test('Kho A báo thất lạc kiện Đang giao: chờ người khác xác nhận', async ({ page }) => {
    await dangNhap(page, seed!.khoA);
    await moKien(page, seed!.dangGiao.id);
    await expect(trangThai(page)).toContainText('Đang giao');
    await nut(page, 'Báo thất lạc').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Mã khiếu nại với đơn vị vận chuyển', { exact: true }).fill('KN-E2E-330');
    await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await toast(page, `Đã báo thất lạc ${seed!.dangGiao.code}`);
    await expect(canhBao(page)).toContainText('KN-E2E-330');
    await expect(trangThai(page)).toContainText('Đang giao');
    await expect(page.getByTestId('lost-note')).toHaveText('Bạn là người báo nên cần một người khác xác nhận.');
    await expect(nut(page, 'Xác nhận thất lạc')).toHaveCount(0);
  });

  test('Kho B xác nhận: kiện sang Thất lạc', async ({ page }) => {
    await dangNhap(page, seed!.khoB);
    await moKien(page, seed!.dangGiao.id);
    await nut(page, 'Xác nhận thất lạc').click();
    const alert = page.getByRole('alertdialog');
    await alert.getByRole('button', { name: 'Xác nhận thất lạc', exact: true }).click();
    await expect(trangThai(page)).toContainText('Thất lạc');
  });

  test('Mở kiện Chờ lấy hàng chờ mở (kiểm kê thiếu): giữ vận đơn, kiện về Đã giữ hàng', async ({ page }) => {
    await dangNhap(page, seed!.khoA);
    await moKien(page, seed!.choMo.id);
    await expect(trangThai(page)).toContainText('Chờ lấy hàng');
    await expect(canhBao(page)).toContainText('Kiểm kê thiếu hàng');
    await expect(nut(page, 'Bàn giao')).toHaveCount(0);
    await nut(page, 'Mở kiện').click();
    const alert = page.getByRole('alertdialog');
    await expect(alert).toContainText('giữ nguyên vận đơn');
    await alert.getByRole('button', { name: 'Mở kiện', exact: true }).click();
    await expect(trangThai(page)).toContainText('Đã giữ hàng');
  });

  test('Kiện Đã đóng gói chờ mở, dỡ về kệ không thấy: A báo, B xác nhận, kiện sang Thất lạc', async ({ page, browser }) => {
    await dangNhap(page, seed!.khoA);
    await moKien(page, seed!.dongChoMo.id);
    await nut(page, 'Báo không thấy kiện').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Ghi chú (vd: không thấy trên kệ)', { exact: true }).fill('Không thấy trên kệ');
    await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await toast(page, `Đã báo thất lạc ${seed!.dongChoMo.code}`);
    await expect(canhBao(page)).toContainText('báo dỡ kiện không thấy');

    const ctx = await browser.newContext();
    const b = await ctx.newPage();
    await dangNhap(b, seed!.khoB);
    await moKien(b, seed!.dongChoMo.id);
    await nut(b, 'Dỡ kiện không thấy').click();
    const alert = b.getByRole('alertdialog');
    await expect(alert).toContainText('Hàng trong kiện được ghi là đã rời kho');
    await alert.getByRole('button', { name: 'Xác nhận thất lạc', exact: true }).click();
    await expect(trangThai(b)).toContainText('Thất lạc');
    await ctx.close();
  });
});
