// P2 · Kho (sơ đồ Tồn kho B2, Phiếu kho B3; FE#6, FE#56)

const so = (text: string) => Number(text.replace(/[^\d-]/g, '')) || 0;
const o = (variantId: string, i: number) => cy.dong(variantId).find('td').eq(i);
/** Thử lại tới khi ô có đúng số (bảng có thể còn số cũ trong lúc nạp lại) */
const coSo = (variantId: string, i: number, n: number) =>
  o(variantId, i).should(($td) => expect(so($td.text())).to.eq(n));
/** Cột của bảng tồn */
const COT = { tonThuc: 2, dangGiu: 3, tamKhoa: 4, khaDung: 5 };

const moPhieu = (number: string) => {
  cy.findByRole('tab', { name: 'Phiếu kho' }).click();
  cy.contains('tbody tr', number).click();
  cy.findByTestId('doc-lines').should('exist');
};
/** Ô nhập thứ i theo nhãn đầu (vd "Số quét") */
const o2 = (label: string, i: number) => cy.findAllByLabelText(new RegExp(`^${label} `)).eq(i);
/** Bấm nút thao tác rồi xác nhận trong hộp thoại */
const thaoTac = (label: string) => {
  cy.findByRole('button', { name: label }).click();
  cy.findByRole('alertdialog').findByRole('button', { name: label }).click();
};

describe('P2 · Kho', () => {
  context('CEO: tồn kho, ngưỡng, duyệt phiếu', () => {
    beforeEach(() => {
      cy.dangNhap('ceo@commerio.vn', 'ceo');
      cy.menu('Kho');
      cy.dong('prd-001-v1').should('exist');
    });

    it('bảy con số: tồn thực, đang giữ, tạm khoá, khả dụng; giá vốn', () => {
      cy.get('thead').within(() => {
        for (const h of ['Tồn thực', 'Đang giữ', 'Tạm khoá', 'Khả dụng', 'Giá vốn BQ', 'Giá trị tồn']) cy.contains('th', h);
      });
      // Khả dụng = tồn thực − đang giữ − tạm khoá
      for (const id of ['prd-001-v1', 'prd-001-v3']) {
        cy.dong(id)
          .find('td')
          .then(($td) => {
            const n = (i: number) => so($td.eq(i).text());
            expect(n(COT.khaDung)).to.eq(Math.max(0, n(COT.tonThuc) - n(COT.dangGiu) - n(COT.tamKhoa)));
          });
      }
      coSo('prd-001-v3', COT.tamKhoa, 2);
    });

    it('lọc nên nhập lại, chờ xử lý; thẻ kho theo khu vực', () => {
      cy.findByRole('button', { name: /Nên nhập lại/ }).click().should('have.attr', 'aria-pressed', 'true');
      cy.get('tbody tr[data-row-id]').should('have.length', 1);
      cy.get('tbody tr[data-row-id]').each(($tr) => expect($tr.find('[data-testid=below-min]')).to.have.length(1));
      cy.findByRole('button', { name: /Nên nhập lại/ }).click();

      cy.findByRole('button', { name: /Có hàng chờ xử lý/ }).click();
      cy.dong('prd-002-v1').findByTestId('stock-chips').should('contain', 'Chờ xử lý 2');
      cy.dong('prd-002-v1').findByRole('button', { name: 'Lịch sử biến động' }).click();
      cy.findByRole('dialog').within(() => {
        cy.findByTestId('stock-figures').should('contain', 'Chờ xử lý').and('contain', 'Tạm khoá');
        cy.findByTestId('stock-moves').should('contain', 'CXL-000001').and('contain', 'Chờ xử lý').and('contain', 'Tồn thực');
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

    it('duyệt xuất huỷ: tạm khoá thành trừ tồn', () => {
      o('prd-001-v3', COT.tonThuc).invoke('text').then(so).as('tonTruoc');
      moPhieu('XH-000001');
      cy.findByTestId('doc-status').should('contain', 'Chờ duyệt');
      cy.findByTestId('doc-lines').should('contain', 'tạm khoá 2');
      thaoTac('Duyệt và ghi sổ');
      cy.findByTestId('doc-status').should('contain', 'Đã ghi sổ');
      cy.findByRole('button', { name: /Duyệt và ghi sổ|Từ chối/ }).should('not.exist');
      cy.contains('Lịch sử').should('exist');

      cy.findByRole('button', { name: 'Danh sách' }).click();
      cy.findByRole('tab', { name: 'Tồn kho' }).click();
      coSo('prd-001-v3', COT.tamKhoa, 0);
      cy.get<number>('@tonTruoc').then((truoc) => coSo('prd-001-v3', COT.tonThuc, truoc - 2));
    });
  });

  context('Nhân viên kho: lập phiếu, kiểm hàng về', () => {
    beforeEach(() => {
      cy.dangNhap('kho@commerio.vn', 'kho');
      cy.menu('Kho');
      cy.dong('prd-002-v1').should('exist');
    });

    const chonBienThe = (sku: string) => {
      cy.get('#variant-picker').click().type(sku);
      cy.contains('[role=option]', sku).click();
    };

    it('kiểm kê: Δ theo số đếm, gửi duyệt thì kho không tự duyệt được', () => {
      cy.findByRole('tab', { name: 'Phiếu kho' }).click();
      cy.findByRole('button', { name: 'Kiểm kê' }).click();
      chonBienThe('QU-0001-M');
      cy.findByTestId('doc-lines').within(() => {
        cy.get('tbody tr td')
          .eq(1)
          .invoke('text')
          .then(so)
          .then((book) => {
            cy.findByLabelText('Số đếm QU-0001-M').type(String(book - 1));
            cy.get('tbody tr td').eq(3).should('have.text', '−1');
          });
      });
      thaoTac('Gửi duyệt');
      cy.toast(/KK-\d+: chờ duyệt/);
      cy.findByTestId('doc-status').should('contain', 'Chờ duyệt');
      cy.findByRole('button', { name: /Duyệt và ghi sổ|Từ chối|Lưu nháp/ }).should('not.exist');
    });

    it('xuất huỷ: bắt buộc lý do, vượt khả dụng thì giữ nháp và báo tại ô', () => {
      o('prd-002-v3', COT.khaDung).invoke('text').then(so).as('khaDung');
      cy.findByRole('tab', { name: 'Phiếu kho' }).click();
      cy.findByRole('button', { name: 'Xuất huỷ' }).click();
      chonBienThe('QU-0003-XL');
      cy.get<number>('@khaDung').then((n) => {
        cy.findByTestId('doc-lines').findByLabelText('Số lượng QU-0003-XL').type(String(n + 1));
        cy.findByRole('button', { name: 'Lưu nháp' }).click();
        cy.get('main').should('contain', 'Nhập lý do');
        cy.get('#doc-note').type('Hàng lỗi đường may');
        thaoTac('Gửi duyệt');
        cy.toast('vượt số hàng hiện có');
        cy.findByTestId('doc-lines').should('contain', `Chỉ còn ${n} khả dụng`);
        cy.findByTestId('doc-status').should('contain', 'Nháp');
      });
    });

    it('kiểm hàng về đủ: chia phải bằng số quét, ghi sổ thẳng', () => {
      moPhieu('KHV-000001');
      cy.get('main').should('contain', 'DH-1001');
      cy.findByTestId('doc-lines').within(() => {
        o2('Số quét', 1).clear().type('3');
        o2('Trả NCC', 1).clear().type('3');
        o2('Số quét', 0).clear().type('2');
        o2('Bán lại', 0).clear().type('1');
      });
      cy.findByRole('button', { name: 'Ghi sổ' }).click();
      cy.findByRole('alertdialog').findByRole('button', { name: 'Ghi sổ' }).click();
      cy.findByTestId('doc-lines').should('contain', 'phải bằng số quét');
      cy.findByTestId('doc-lines').within(() => {
        o2('Hỏng', 0).clear().type('1');
      });
      thaoTac('Ghi sổ');
      cy.findByTestId('doc-status').should('contain', 'Đã ghi sổ');
    });

    it('kiểm hàng về thiếu: cờ khiếu nại, người quét không tự duyệt', () => {
      moPhieu('KHV-000002');
      cy.findByRole('button', { name: 'Ghi sổ' }).should('have.attr', 'aria-disabled', 'true');
      cy.findByTestId('lifecycle-blocked').should('contain', 'cần người thứ hai duyệt');
      cy.get('main').should('contain', 'Thiếu 1 so với dự kiến');
      cy.findByRole('button', { name: 'Gửi duyệt phần thiếu' }).click();
      cy.findByRole('alertdialog').findByRole('button', { name: 'Gửi duyệt' }).click();
      cy.findByTestId('doc-status').should('contain', 'Chờ duyệt').and('contain', 'Khiếu nại');
      cy.findByRole('button', { name: /Duyệt và ghi sổ|Yêu cầu kiểm lại/ }).should('not.exist');
    });

    it('huỷ phiếu nháp; phiếu theo đơn chỉ xem', () => {
      moPhieu('PX-000001');
      cy.findByRole('button', { name: /Ghi sổ|Lưu nháp|Huỷ phiếu|Gửi duyệt/ }).should('not.exist');
      cy.findByRole('button', { name: 'Danh sách' }).click();

      cy.contains('tbody tr', 'KK-000001').click();
      cy.findByRole('button', { name: 'Huỷ phiếu' }).click();
      cy.findByRole('alertdialog').within(() => {
        cy.findByRole('heading', { name: 'Huỷ phiếu KK-000001?' });
        cy.findByRole('button', { name: 'Huỷ phiếu' }).click();
      });
      cy.toast('KK-000001: đã huỷ');
      cy.findByTestId('doc-status').should('contain', 'Đã huỷ');
    });
  });
});
