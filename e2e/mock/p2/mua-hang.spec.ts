// P2 · Mua hàng (sơ đồ A1 đề nghị nhập, A2 phiếu nhận, B4 trả nhà cung cấp; FE#17)
import { type Page } from '@playwright/test';
import { chon, chua, dangNhap, expect, menu, test, thayChu, toast } from '../../fixtures';

const moTab = async (page: Page, tab: string, number: string) => {
  await menu(page, 'Mua hàng');
  await page.getByRole('tab', { name: tab, exact: true }).click();
  await chua(page, number, 'tbody tr').click();
};
/** Bấm nút thao tác rồi xác nhận trong hộp thoại */
const thaoTac = async (page: Page, label: string) => {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: label, exact: true }).click();
};

test.describe('P2 · Mua hàng', () => {
  test.describe('CEO', () => {
    test.beforeEach(({ page }) => dangNhap(page, 'ceo@commerio.vn', 'ceo'));

    test('tự duyệt đề nghị mình lập rồi tự ghi sổ phiếu nhận (A1, A2; FE#93)', async ({ page }) => {
      await moTab(page, 'Đề nghị nhập', 'DN-000003');
      await expect(page.getByTestId('request-status')).toContainText('Chờ duyệt');
      for (const label of ['Duyệt', 'Yêu cầu sửa', 'Từ chối']) {
        const nut = page.getByRole('button', { name: label, exact: true });
        await expect(nut).toBeVisible();
        await expect(nut).not.toHaveAttribute('aria-disabled', 'true');
      }
      await thaoTac(page, 'Duyệt');
      await toast(page, 'DN-000003');
      await expect(page.getByTestId('request-status')).toContainText('Đã duyệt');
      await expect(page.getByRole('button', { name: 'Duyệt', exact: true })).toHaveCount(0);

      // Đã đặt nhà cung cấp cần ngày giao dự kiến (BE#243)
      await page.getByRole('button', { name: 'Đã đặt hàng', exact: true }).click();
      const datNcc = page.getByRole('dialog');
      await datNcc.getByRole('button', { name: 'Đã đặt hàng', exact: true }).click();
      await expect(datNcc.getByText('Nhập ngày nhà cung cấp hẹn giao', { exact: true })).toBeVisible();
      await datNcc.getByLabel('Ngày giao dự kiến', { exact: true }).fill('2026-11-20');
      await datNcc.getByLabel('Mã đơn bên nhà cung cấp (nếu có)', { exact: true }).fill('PO-778');
      await datNcc.getByRole('button', { name: 'Đã đặt hàng', exact: true }).click();
      await page.getByRole('button', { name: 'Lập phiếu nhận', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Lập phiếu', exact: true }).click();
      await toast(page, 'Đã lập phiếu nhận');
      await expect(page.getByTestId('receipt-status')).toContainText('Đang kiểm hàng');
      await page.getByLabel(/^Báo giao /).first().fill('1');
      await page.getByLabel(/^Đạt /).first().fill('0');
      // Đạt ít hơn báo giao: dòng có vạch chênh và nhãn Chênh giải thích (FE#137)
      const dong = page.getByTestId('receipt-lines').locator('tbody tr').first();
      await expect(dong).toHaveClass(/\bchg\b/);
      await expect(dong.getByTestId('receipt-diff')).toHaveAttribute('aria-label', /thiếu 1/);
      await page.getByLabel(/^Đạt /).first().fill('1');
      // Giao một phần vẫn là chênh với số còn chờ, nhưng hết thiếu
      await expect(dong.getByTestId('receipt-diff')).toHaveAttribute('aria-label', /: Nhà cung cấp báo giao 1, còn chờ \d+\.$/);
      // Dòng chưa giao lần này không bị đánh dấu
      const dong2 = page.getByTestId('receipt-lines').locator('tbody tr').nth(1);
      await expect(dong2).not.toHaveClass(/\bchg\b/);
      await expect(dong2.getByTestId('receipt-diff')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Nhập kho', exact: true })).not.toHaveAttribute('aria-disabled', 'true');
      await thaoTac(page, 'Nhập kho');
      await expect(page.getByTestId('receipt-status')).toContainText('Đã nhập kho');
    });

    test('loại dòng của đề nghị người khác lập: bắt buộc lý do, lý do hiện dưới dòng bị loại (US-NH-03; BE#243)', async ({ page }) => {
      await moTab(page, 'Đề nghị nhập', 'DN-000004');
      await thaoTac(page, 'Gửi duyệt');
      await expect(page.getByTestId('request-status')).toContainText('Chờ duyệt');
      const dong = page.getByTestId('request-lines').locator('tbody tr').first();
      await dong.getByRole('button', { name: 'Loại dòng', exact: true }).click();
      const hop = page.getByRole('dialog');
      await hop.getByRole('textbox').fill('Nhà cung cấp báo hết mẫu này');
      await hop.getByRole('button', { name: 'Loại dòng', exact: true }).click();
      await expect(dong).toContainText('Đã loại');
      await expect(dong.getByTestId('excluded-reason')).toHaveText('Lý do loại: Nhà cung cấp báo hết mẫu này');
      // Lấy lại dòng thì hết lý do
      await dong.getByRole('button', { name: 'Lấy lại dòng', exact: true }).click();
      await expect(dong.getByTestId('excluded-reason')).toHaveCount(0);
    });

    test('CEO là người gửi phiếu trả vẫn tự ghi kết quả từ nhà cung cấp được (ngoại lệ tự duyệt, B4; BE#210)', async ({ page }) => {
      await moTab(page, 'Trả nhà cung cấp', 'TN-000001');
      await expect(page.getByTestId('return-status')).toContainText('Đã gửi NCC');
      // Người gửi không phải CEO thì bị chặn (unit test bảng chuyển); CEO được tự làm nên không có dòng chặn
      await expect(page.getByTestId('lifecycle-blocked')).toHaveCount(0);
      for (const label of ['Ghi NCC hoàn tiền', 'Ghi NCC đổi hàng', 'Ghi NCC từ chối']) {
        await expect(page.getByRole('button', { name: label, exact: true })).not.toHaveAttribute('aria-disabled', 'true');
      }
    });

    test('đề nghị bù hàng khoá giá nhập theo dòng gốc của phiếu trả (B4; BE#365)', async ({ page }) => {
      await moTab(page, 'Trả nhà cung cấp', 'TN-000001');
      await thaoTac(page, 'Nhà cung cấp bù hàng');
      await expect(page.getByTestId('return-status')).toContainText('bù hàng');
      await page.getByRole('button', { name: 'Lập đề nghị bù hàng', exact: true }).click();
      const khoa = page.getByTestId('locked-cost');
      await expect(khoa).toHaveCount(2);
      await expect(khoa.first()).toContainText('80.000');
      await expect(khoa.first()).toContainText('Theo giá dòng gốc TN-000001');
      await expect(page.getByTestId('request-lines').getByRole('textbox', { name: /^Giá nhập/ })).toHaveCount(0);

      // Chỉ SKU đã trả, số không quá số đã trả (#365)
      await expect(page.getByRole('button', { name: 'Sản phẩm mới', exact: true })).toHaveCount(0);
      await expect(page.getByTestId('request-lines')).toContainText('Đã trả 1');
      await page.getByRole('textbox', { name: /^Số lượng/ }).first().fill('3');
      await page.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
      await expect(page.getByText('Không quá số đã trả 1', { exact: true })).toBeVisible();
      await page.getByRole('textbox', { name: /^Số lượng/ }).first().fill('1');
      await page.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
      await expect(page.getByTestId('request-status')).toContainText('Nháp');
    });

    test('dòng sản phẩm mới: cha mới gộp các dòng cùng tên, cha có sẵn theo trục của cha; duyệt sinh SKU (US-NH-01; BE#243)', async ({ page }) => {
      await page.goto('/c/cmp-001/purchasing/requests/new');
      await page.locator('#req-supplier').click();
      await page.getByRole('option', { name: 'Xưởng may Thành Công', exact: true }).click();
      const bang = page.getByTestId('request-lines');
      const them = () => page.getByRole('button', { name: 'Sản phẩm mới', exact: true }).click();

      // Hai dòng cha mới cùng tên "Áo len", trục Màu sắc; dòng thứ hai trùng giá trị
      for (let i = 0; i < 2; i++) {
        await them();
        const dongMoi = page.getByTestId(`new-product-${i}`);
        await dongMoi.getByLabel(/^Tên sản phẩm cha/).fill('Áo len');
        await chon(dongMoi, `Danh mục Áo len`, 'Áo');
        await chon(dongMoi, `Trục phân loại 1 Áo len`, 'Màu sắc');
        await dongMoi.getByLabel(/^Màu sắc/).fill('Kem');
      }
      await bang.getByRole('textbox', { name: /^Số lượng/ }).nth(0).fill('10');
      await bang.getByRole('textbox', { name: /^Số lượng/ }).nth(1).fill('5');
      await bang.getByRole('textbox', { name: /^Giá nhập/ }).nth(0).fill('120000');
      await bang.getByRole('textbox', { name: /^Giá nhập/ }).nth(1).fill('120000');
      await page.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
      await expect(page.getByTestId('new-product-1')).toContainText('Trùng phân loại với dòng 1 cùng sản phẩm cha');
      await page.getByTestId('new-product-1').getByLabel(/^Màu sắc/).fill('Xám');

      // Cha có sẵn: trục lấy từ sản phẩm, trùng phân loại đã có thì BE báo tại ô
      await them();
      const coSan = page.getByTestId('new-product-2');
      await coSan.getByText('Cha có sẵn', { exact: true }).click();
      await coSan.getByRole('combobox', { name: /^Sản phẩm cha/ }).fill('kaki');
      await page.getByRole('option', { name: /Quần kaki ống suông/ }).click();
      await expect(coSan.getByLabel(/^Kích cỡ/)).toBeVisible();
      await coSan.getByLabel(/^Kích cỡ/).fill('XL');
      await bang.getByRole('textbox', { name: /^Số lượng/ }).nth(2).fill('4');
      await bang.getByRole('textbox', { name: /^Giá nhập/ }).nth(2).fill('150000');
      await page.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
      await expect(coSan).toContainText('Phân loại này đã có trong sản phẩm cha');
      await coSan.getByLabel(/^Kích cỡ/).fill('XXL');
      await page.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
      await expect(page).toHaveURL(/\/purchasing\/requests\/(?!new)[^/]+$/);
      // Nháp đã lưu nạp lại từ phản hồi của server: ô nhập giữ cha, trục, giá trị
      await expect(page.getByTestId('new-product-0').getByLabel(/^Tên sản phẩm cha/)).toHaveValue('Áo len');
      await expect(page.getByTestId('new-product-1').getByLabel(/^Màu sắc/)).toHaveValue('Xám');
      await expect(page.getByTestId('new-product-2').getByLabel(/^Kích cỡ/)).toHaveValue('XXL');

      // Gửi duyệt thì chỉ xem: hiện phân loại và loại cha
      await thaoTac(page, 'Gửi duyệt');
      await expect(page.getByTestId('request-status')).toContainText('Chờ duyệt');
      await expect(bang).toContainText('Màu sắc: Kem · Cha mới · Danh mục Áo');
      await expect(bang).toContainText('Kích cỡ: XXL · Cha có sẵn');

      // CEO tự duyệt: sinh một sản phẩm "Áo len" hai SKU và thêm SKU vào Quần kaki
      await thaoTac(page, 'Duyệt');
      await expect(page.getByTestId('request-status')).toContainText('Đã duyệt');
      await expect(bang).toContainText('AO-');
      await expect(bang).toContainText('QU-');
      await expect(bang).toContainText('Áo len · Xám');
      await expect(bang).toContainText('Quần kaki ống suông · XXL');
    });

    test('tồn dưới ngưỡng: thêm vào đề nghị nhập nháp (B2 → A1)', async ({ page }) => {
      await menu(page, 'Kho');
      await page.getByRole('tab', { name: /Nên nhập lại/ }).click();
      await page
        .locator('tbody tr[data-row-id]')
        .first()
        .getByRole('button', { name: 'Thêm vào đề nghị nhập', exact: true })
        .click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Số lượng', { exact: true }).fill('0');
      await dialog.getByRole('button', { name: 'Thêm vào đề nghị', exact: true }).click();
      await thayChu(dialog, 'Số lượng là số nguyên từ 1');
      await dialog.getByLabel('Số lượng', { exact: true }).fill('5');
      await dialog.getByRole('button', { name: 'Thêm vào đề nghị', exact: true }).click();
      await toast(page, 'Đã thêm vào DN-000004');
    });

    test('báo cáo nhà cung cấp lọc theo kỳ ghi sổ (A2)', async ({ page }) => {
      await menu(page, 'Mua hàng');
      await page.getByRole('tab', { name: 'Nhà cung cấp', exact: true }).click();
      const phieuNhan = () => chua(page, 'Xưởng may Thành Công', 'tbody tr').locator('td').nth(1);
      // NH-000001 ghi sổ ngày 08/10/2026
      await page.getByLabel('Ghi sổ từ ngày', { exact: true }).fill('2026-10-08');
      await page.getByLabel('Đến ngày', { exact: true }).fill('2026-10-08');
      await expect(phieuNhan()).toHaveText('1');
      await page.getByLabel('Ghi sổ từ ngày', { exact: true }).fill('2026-10-09');
      await page.getByLabel('Đến ngày', { exact: true }).fill('2026-10-09');
      await expect(phieuNhan()).toHaveText('0');
    });
  });

  test.describe('Kho', () => {
    test.beforeEach(({ page }) => dangNhap(page, 'kho@commerio.vn', 'kho'));

    test('kiểm đếm báo lỗi tiếng Việt, rồi ghi sổ phiếu đủ hàng (A2)', async ({ page }) => {
      await moTab(page, 'Phiếu nhận', 'NH-000002');
      await expect(page.getByTestId('receipt-status')).toContainText('Đang kiểm hàng');
      await thayChu(page, 'Kiểm sau (trong 24 giờ)');
      await page.getByLabel(/^Đạt /).first().fill('12');
      await page.getByRole('button', { name: 'Lưu', exact: true }).click();
      await thayChu(page, 'SL đạt + lỗi + trả lại vượt SL NCC giao');

      await page.getByLabel(/^Đạt /).first().fill('10');
      await thaoTac(page, 'Nhập kho');
      await toast(page, 'NH-000002');
      await expect(page.getByTestId('receipt-status')).toContainText('Đã nhập kho');
      await expect(page.getByRole('button', { name: 'Nhập kho', exact: true })).toHaveCount(0);
    });

    test('lập phiếu nhận giao bù: chọn phiếu Giao thiếu của cùng đề nghị, phiếu mới hiện phiếu được bù (A2; BE#244)', async ({ page }) => {
      await moTab(page, 'Đề nghị nhập', 'DN-000002');
      await page.getByRole('button', { name: 'Lập phiếu nhận', exact: true }).click();
      const hop = page.getByRole('dialog');
      await hop.getByLabel('Giao bù cho phiếu', { exact: true }).click();
      await page.getByRole('option', { name: 'NH-000001 (giao thiếu)', exact: true }).click();
      await hop.getByRole('button', { name: 'Lập phiếu', exact: true }).click();
      await toast(page, 'Đã lập phiếu nhận');
      await expect(page.getByTestId('receipt-status')).toContainText('Đang kiểm hàng');
      await thayChu(page, 'Giao bù cho phiếu');
      await expect(page.getByRole('link', { name: 'NH-000001', exact: true })).toBeVisible();
    });
  });

  test.describe('Mua hàng ↔ CEO', () => {
    test('Mua hàng ghi nhà cung cấp hoàn tiền cho phiếu CEO đã gửi (B4)', async ({ page }) => {
      await dangNhap(page, 'muahang@commerio.vn', 'muahang');
      await moTab(page, 'Trả nhà cung cấp', 'TN-000001');
      await page.getByRole('button', { name: 'Ghi NCC hoàn tiền', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Ghi hoàn tiền', exact: true }).click();
      await thayChu(dialog, 'Nhập số tiền hoàn');
      await dialog.getByLabel(/Số tiền nhà cung cấp hoàn/).fill('240000');
      await dialog.getByRole('button', { name: 'Ghi hoàn tiền', exact: true }).click();
      await expect(page.getByTestId('return-status')).toContainText('NCC đã hoàn tiền');
      await thayChu(page, '240.000');
    });

    test('Mua hàng gửi duyệt phiếu trả nháp, không tự duyệt (B4)', async ({ page }) => {
      await dangNhap(page, 'muahang@commerio.vn', 'muahang');
      await moTab(page, 'Trả nhà cung cấp', 'TN-000002');
      await thaoTac(page, 'Gửi duyệt');
      await expect(page.getByTestId('return-status')).toContainText('Chờ duyệt');
      // Thiếu quyền duyệt: nút vẫn hiện nhưng mờ, kèm lý do (FE#137)
      const duyet = page.getByRole('button', { name: 'Duyệt và gửi NCC', exact: true });
      await expect(duyet).toHaveAttribute('aria-disabled', 'true');
      await expect(duyet).toHaveAttribute('data-blocked-reason', 'Bạn không có quyền này.');
    });

    test('Mua hàng xem đề nghị chờ duyệt: nút Duyệt mờ kèm lý do (A1; FE#137)', async ({ page }) => {
      await dangNhap(page, 'muahang@commerio.vn', 'muahang');
      await moTab(page, 'Đề nghị nhập', 'DN-000003');
      await expect(page.getByTestId('request-status')).toContainText('Chờ duyệt');
      const duyet = page.getByRole('button', { name: 'Duyệt', exact: true });
      await expect(duyet).toHaveAttribute('aria-disabled', 'true');
      await expect(duyet).toHaveAttribute('data-blocked-reason', 'Bạn không có quyền này.');
      await duyet.hover();
      await expect(page.getByRole('tooltip')).toContainText('Bạn không có quyền này');
      // Thiếu quyền không phải chặn của quy trình nên không liệt kê dưới thanh bước
      await expect(page.getByTestId('lifecycle-blocked')).toHaveCount(0);
    });

    // Đăng nhập lại tải trang làm mock về dữ liệu đầu, nên phần CEO duyệt chạy trong một phiên
    test('CEO duyệt và gửi phiếu trả chờ duyệt (B4)', async ({ page }) => {
      await dangNhap(page, 'ceo@commerio.vn', 'ceo');
      await moTab(page, 'Trả nhà cung cấp', 'TN-000002');
      await thaoTac(page, 'Gửi duyệt');
      await expect(page.getByTestId('return-status')).toContainText('Chờ duyệt');
      await thaoTac(page, 'Duyệt và gửi NCC');
      await expect(page.getByTestId('return-status')).toContainText('Đã gửi NCC');
    });
  });
});
