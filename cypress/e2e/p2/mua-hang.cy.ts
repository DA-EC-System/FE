// P2 · Mua hàng (sơ đồ A1 đề nghị nhập, A2 phiếu nhận, B4 trả NCC; FE#17)

const moTab = (tab: string, number: string) => {
  cy.menu('Mua hàng');
  cy.findByRole('tab', { name: tab }).click();
  cy.contains('tbody tr', number).click();
};
/** Bấm nút thao tác rồi xác nhận trong hộp thoại */
const thaoTac = (label: string) => {
  cy.findByRole('button', { name: label }).click();
  cy.findByRole('alertdialog').findByRole('button', { name: label }).click();
};

describe('P2 · Mua hàng', () => {
  context('CEO', () => {
    beforeEach(() => cy.dangNhap('ceo@commerio.vn', 'ceo'));

    it('tự duyệt đề nghị mình lập rồi tự ghi sổ phiếu nhận (A1, A2; FE#93)', () => {
      moTab('Đề nghị nhập', 'DN-000003');
      cy.findByTestId('request-status').should('contain', 'Chờ duyệt');
      for (const label of ['Duyệt', 'Trả về', 'Từ chối']) {
        cy.findByRole('button', { name: label }).should('be.visible').and('not.have.attr', 'aria-disabled', 'true');
      }
      thaoTac('Duyệt');
      cy.toast('DN-000003');
      cy.findByTestId('request-status').should('contain', 'Đã duyệt');
      cy.findByRole('button', { name: 'Duyệt' }).should('not.exist');

      thaoTac('Đã đặt NCC');
      cy.findByRole('button', { name: 'Lập phiếu nhận' }).click();
      cy.findByRole('dialog').findByRole('button', { name: 'Lập phiếu' }).click();
      cy.toast('Đã lập phiếu nhận');
      cy.findByTestId('receipt-status').should('contain', 'Đang kiểm');
      cy.findAllByLabelText(/^Báo giao /).first().clear().type('1');
      cy.findAllByLabelText(/^Đạt /).first().clear().type('1');
      cy.findByRole('button', { name: 'Ghi sổ' }).should('not.have.attr', 'aria-disabled', 'true');
      thaoTac('Ghi sổ');
      cy.findByTestId('receipt-status').should('contain', 'Khớp');
    });

    it('người gửi phiếu trả không tự ghi kết quả từ NCC (B4)', () => {
      moTab('Trả NCC', 'TN-000001');
      cy.findByTestId('return-status').should('contain', 'Đã gửi');
      cy.findByTestId('lifecycle-blocked').should('contain', 'Cần người thứ hai');
      for (const label of ['NCC hoàn tiền', 'NCC bù hàng', 'NCC không nhận']) {
        cy.findByRole('button', { name: label }).should('have.attr', 'aria-disabled', 'true');
      }
    });

    it('tồn dưới ngưỡng: thêm vào đề nghị nhập nháp (B2 → A1)', () => {
      cy.menu('Kho');
      cy.findByRole('button', { name: /Nên nhập lại/ }).click();
      cy.get('tbody tr[data-row-id]').first().findByRole('button', { name: 'Thêm vào đề nghị nhập' }).click();
      cy.findByRole('dialog').within(() => {
        cy.findByLabelText('Số lượng').clear().type('0');
        cy.findByRole('button', { name: 'Thêm vào đề nghị' }).click();
        cy.contains('Số lượng là số nguyên từ 1');
        cy.findByLabelText('Số lượng').clear().type('5');
        cy.findByRole('button', { name: 'Thêm vào đề nghị' }).click();
      });
      cy.toast('Đã thêm vào DN-000004');
    });

    it('báo cáo NCC lọc theo kỳ ghi sổ (A2)', () => {
      cy.menu('Mua hàng');
      cy.findByRole('tab', { name: 'Nhà cung cấp' }).click();
      const phieuNhan = () => cy.contains('tbody tr', 'Xưởng may Thành Công').find('td').eq(1);
      // NH-000001 ghi sổ ngày 08/10/2026
      cy.findByLabelText('Ghi sổ từ ngày').type('2026-10-08');
      cy.findByLabelText('Đến ngày').type('2026-10-08');
      phieuNhan().should('have.text', '1');
      cy.findByLabelText('Ghi sổ từ ngày').clear().type('2026-10-09');
      cy.findByLabelText('Đến ngày').clear().type('2026-10-09');
      phieuNhan().should('have.text', '0');
    });
  });

  context('Kho', () => {
    beforeEach(() => cy.dangNhap('kho@commerio.vn', 'kho'));

    it('kiểm đếm báo lỗi tiếng Việt, rồi ghi sổ phiếu đủ hàng (A2)', () => {
      moTab('Phiếu nhận', 'NH-000002');
      cy.findByTestId('receipt-status').should('contain', 'Đang kiểm');
      cy.contains('Người giao đã đi');
      cy.findAllByLabelText(/^Đạt /).first().clear().type('12');
      cy.findByRole('button', { name: 'Lưu' }).click();
      cy.contains('Đạt, lỗi giữ, trả tại chỗ cộng lại vượt số báo giao');

      cy.findAllByLabelText(/^Đạt /).first().clear().type('10');
      thaoTac('Ghi sổ');
      cy.toast('NH-000002');
      cy.findByTestId('receipt-status').should('contain', 'Khớp');
      cy.findByRole('button', { name: 'Ghi sổ' }).should('not.exist');
    });
  });

  context('Mua hàng ↔ CEO', () => {
    it('Mua hàng ghi NCC hoàn tiền cho phiếu CEO đã gửi (B4)', () => {
      cy.dangNhap('muahang@commerio.vn', 'muahang');
      moTab('Trả NCC', 'TN-000001');
      cy.findByRole('button', { name: 'NCC hoàn tiền' }).click();
      cy.findByRole('dialog').within(() => {
        cy.findByRole('button', { name: 'Ghi hoàn tiền' }).click();
        cy.contains('Nhập số tiền hoàn');
        cy.findByLabelText(/Số tiền NCC hoàn/).type('240000');
        cy.findByRole('button', { name: 'Ghi hoàn tiền' }).click();
      });
      cy.findByTestId('return-status').should('contain', 'NCC hoàn tiền');
      cy.contains('240.000');
    });

    it('Mua hàng gửi duyệt phiếu trả nháp, không tự duyệt (B4)', () => {
      cy.dangNhap('muahang@commerio.vn', 'muahang');
      moTab('Trả NCC', 'TN-000002');
      thaoTac('Gửi duyệt');
      cy.findByTestId('return-status').should('contain', 'Chờ duyệt');
      cy.findByRole('button', { name: 'Duyệt và gửi' }).should('not.exist');
    });

    // Đăng nhập lại tải trang làm mock về dữ liệu đầu, nên phần CEO duyệt chạy trong một phiên
    it('CEO duyệt và gửi phiếu trả chờ duyệt (B4)', () => {
      cy.dangNhap('ceo@commerio.vn', 'ceo');
      moTab('Trả NCC', 'TN-000002');
      thaoTac('Gửi duyệt');
      cy.findByTestId('return-status').should('contain', 'Chờ duyệt');
      thaoTac('Duyệt và gửi');
      cy.findByTestId('return-status').should('contain', 'Đã gửi');
    });
  });
});
