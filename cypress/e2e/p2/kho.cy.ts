// P2 · Kho (UC-IN-01, 02, 03; FE#6, commerio-backend#16)

const so = (text: string) => Number(text.replace(/\D/g, '')) || 0;
const o = (variantId: string, i: number) => cy.dong(variantId).find('td').eq(i);
/** Thử lại tới khi ô có đúng số (bảng có thể còn số cũ trong lúc nạp lại) */
const coSo = (variantId: string, i: number, n: number) =>
  o(variantId, i).should(($td) => expect(so($td.text())).to.eq(n));

describe('P2 · Kho', () => {
  context('CEO: tồn kho, ngưỡng', () => {
    beforeEach(() => {
      cy.dangNhap('ceo@commerio.vn', 'ceo');
      cy.menu('Kho');
      cy.dong('prd-001-v1').should('exist');
    });

    it('tồn thực, đang giữ, khả dụng và giá vốn', () => {
      cy.get('thead').within(() => {
        for (const h of ['Tồn thực', 'Đang giữ', 'Khả dụng', 'Giá vốn BQ', 'Giá trị tồn']) cy.contains('th', h);
      });
      coSo('prd-001-v1', 2, 58);
      coSo('prd-001-v1', 3, 5);
      coSo('prd-001-v1', 4, 53);
    });

    it('lọc dòng dưới ngưỡng, xem lịch sử biến động', () => {
      cy.findByRole('button', { name: /Dưới ngưỡng tồn/ }).click().should('have.attr', 'aria-pressed', 'true');
      cy.get('tbody tr[data-row-id]').should('have.length', 2);
      cy.dong('prd-001-v4').should('exist');
      cy.dong('prd-002-v3').should('exist');
      cy.findByRole('button', { name: /Dưới ngưỡng tồn/ }).click();

      cy.dong('prd-001-v1').findByRole('button', { name: 'Lịch sử biến động' }).click();
      cy.findByRole('dialog').within(() => {
        cy.findByTestId('stock-figures').should('contain', '58').and('contain', '53');
        cy.findByTestId('stock-moves').find('tbody tr').should('have.length', 3);
        cy.findByTestId('stock-moves').should('contain', 'PN-000002').and('contain', 'PX-000001');
      });
    });

    it('đặt ngưỡng: kiểm số, lưu, bỏ ngưỡng', () => {
      cy.dong('prd-003-v1').findByRole('button', { name: 'Đặt ngưỡng' }).click();
      cy.findByRole('dialog').within(() => {
        for (const t of ['-1', '1.5', 'abc']) {
          cy.get('#min-qty').clear().type(t);
          cy.findByRole('button', { name: 'Lưu' }).click();
          cy.get('.text-destructive').should('not.be.empty');
        }
        cy.get('#min-qty').clear().type('60');
        cy.findByRole('button', { name: 'Lưu' }).click();
      });
      cy.toast('Đã đặt ngưỡng 60');
      cy.dong('prd-003-v1').findByTestId('min-qty').should('have.text', '60');
      cy.dong('prd-003-v1').findByTestId('below-min').should('exist');

      cy.dong('prd-003-v1').findByRole('button', { name: 'Đặt ngưỡng' }).click();
      cy.findByRole('dialog').within(() => {
        cy.get('#min-qty').clear();
        cy.findByRole('button', { name: 'Lưu' }).click();
      });
      cy.toast('Đã bỏ ngưỡng tồn');
      cy.dong('prd-003-v1').findByTestId('below-min').should('not.exist');
    });

    it('ngưỡng bị người khác sửa trước thì hiện ngưỡng mới nhất', () => {
      cy.dong('prd-003-v1').findByRole('button', { name: 'Đặt ngưỡng' }).click();
      cy.get('#min-qty').clear().type('8');
      cy.mockApi('put', '/inventory/stock/:variantId/reorder-rule', 409, {
        status: 409,
        title: 'Dữ liệu đã thay đổi',
        code: 'version_conflict',
        current: { variantId: 'prd-003-v1', minQty: 25, reorderVersion: 9, belowMin: true },
      });
      cy.findByRole('dialog').findByRole('button', { name: 'Lưu' }).click();
      cy.get('#min-qty').should('have.value', '25');
      cy.findByRole('dialog').should('contain', 'Ngưỡng vừa được người khác sửa');
    });
  });

  context('Nhân viên kho: phiếu nhập, xuất', () => {
    beforeEach(() => {
      cy.dangNhap('kho@commerio.vn', 'kho');
      cy.menu('Kho');
      cy.dong('prd-002-v1').should('exist');
    });

    const chonBienThe = (sku: string) => {
      cy.get('#variant-picker').click().type(sku);
      cy.contains('[role=option]', sku).click();
    };

    it('phiếu nhập: lưu nháp chưa đổi tồn, ghi sổ thì cộng tồn', () => {
      o('prd-002-v1', 2).invoke('text').then(so).as('tonTruoc');
      cy.findByRole('tab', { name: 'Phiếu nhập/xuất' }).click();
      cy.findByRole('button', { name: 'Lập phiếu nhập' }).click();
      chonBienThe('QU-0001-M');
      cy.findByTestId('doc-lines').within(() => {
        cy.findByLabelText('Số lượng QU-0001-M').type('10');
      });
      cy.findByRole('button', { name: 'Lưu nháp' }).click();
      cy.findByTestId('doc-lines').should('contain', 'Nhập giá nhập');
      cy.findByTestId('doc-lines').findByLabelText('Giá nhập QU-0001-M').type('200000');
      cy.findByRole('button', { name: 'Lưu nháp' }).click();
      cy.toast(/Đã lưu nháp PN-\d+/);
      cy.findByTestId('doc-status').should('have.text', 'Nháp');

      cy.findByRole('button', { name: 'Ghi sổ' }).click();
      cy.findByRole('alertdialog').findByRole('button', { name: 'Ghi sổ' }).click();
      cy.toast(/Đã ghi sổ PN-\d+; tồn kho đã cập nhật/);
      cy.findByTestId('doc-status').should('have.text', 'Đã ghi sổ');
      cy.findByRole('button', { name: /Ghi sổ|Lưu nháp|Huỷ phiếu/ }).should('not.exist');

      cy.findByRole('button', { name: 'Danh sách' }).click();
      cy.findByRole('tab', { name: 'Tồn kho' }).click();
      cy.get<number>('@tonTruoc').then((truoc) => {
        coSo('prd-002-v1', 2, truoc + 10);
      });
    });

    it('phiếu xuất: bắt buộc lý do, vượt khả dụng thì giữ nháp và báo tại ô', () => {
      cy.findByRole('tab', { name: 'Phiếu nhập/xuất' }).click();
      cy.findByRole('button', { name: 'Lập phiếu xuất' }).click();
      chonBienThe('QU-0003-XL');
      cy.findByTestId('doc-lines').findByLabelText('Số lượng QU-0003-XL').type('5');
      cy.findByRole('button', { name: 'Lưu nháp' }).click();
      cy.get('main').should('contain', 'Nhập lý do xuất kho');
      cy.get('#doc-note').type('Hàng lỗi đường may');
      cy.findByRole('button', { name: 'Lưu và ghi sổ' }).click();
      cy.findByRole('alertdialog').findByRole('button', { name: 'Ghi sổ' }).click();
      cy.toast('vượt số khả dụng');
      cy.findByTestId('doc-lines').should('contain', 'Chỉ còn 1 khả dụng');
      cy.findByTestId('doc-status').should('have.text', 'Nháp');
    });

    it('huỷ phiếu nháp; phiếu theo đơn không sửa được', () => {
      cy.findByRole('tab', { name: 'Phiếu nhập/xuất' }).click();
      cy.contains('tbody tr', 'PX-000001').click();
      cy.findByTestId('doc-lines').should('exist');
      cy.findByRole('button', { name: /Ghi sổ|Lưu nháp|Huỷ phiếu/ }).should('not.exist');
      cy.findByRole('button', { name: 'Danh sách' }).click();

      cy.contains('tbody tr', 'PN-000003').click();
      cy.findByRole('button', { name: 'Huỷ phiếu' }).click();
      cy.findByRole('alertdialog').within(() => {
        cy.findByRole('heading', { name: 'Huỷ PN-000003?' });
        cy.findByRole('button', { name: 'Huỷ phiếu' }).click();
      });
      cy.toast('Đã huỷ PN-000003');
      cy.findByTestId('doc-status').should('have.text', 'Đã huỷ');
    });
  });
});
