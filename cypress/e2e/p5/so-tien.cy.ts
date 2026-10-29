// P5 · Sổ tiền (sơ đồ D4.1; FE#76): dòng sổ ước tính/thực tế, sàn quyết toán thay dòng, lãi theo đơn, cảnh báo mốc

const CHAN_QUYEN = 'Vai trò của bạn trong công ty này không có quyền mở trang này.';

const diToi = (path: string) =>
  cy.window().then((win) => {
    win.history.pushState({}, '', path);
    win.dispatchEvent(new PopStateEvent('popstate'));
  });

/** Sàn giả lập: điền tham số rồi phát sự kiện */
const phat = (type: string, value: string) => {
  cy.get(`[data-event="${type}"]`).within(() => {
    cy.findByRole('textbox').clear().type(value);
    cy.findByRole('button', { name: 'Phát' }).click();
  });
};

const tienDon = () => cy.get('[data-testid=order-profit]');

/** Sàn báo giao kiện của DH-1015 rồi quay lại trang sàn giả lập */
const giaoDH1015 = () => {
  cy.visit('/c/cmp-001/sales/orders/ord-1015');
  cy.contains(/KH-\d{6}/)
    .invoke('text')
    .then((text) => {
      const code = text.match(/KH-\d{6}/)![0];
      diToi('/c/cmp-001/dev/marketplace');
      phat('package.shipping_update', `${code} delivered`);
      cy.toast(new RegExp(`${code}: .* → delivered`));
    });
};

describe('P5 · Sổ tiền', () => {
  context('CEO', () => {
    beforeEach(() => cy.dangNhap('ceo@commerio.vn', 'ceo'));

    it('trang sổ tiền: chỉ số, cảnh báo mốc doanh thu, dòng sổ có sẵn', () => {
      cy.visit('/c/cmp-001/finance/ledger');
      cy.contains('h1', 'Sổ tiền');
      cy.get('[data-testid=tax-warnings]').should('contain', 'sắp vượt mốc 500 triệu').and('contain', 'App không khai thuế');
      cy.get('[data-testid=kpi-withdrawn]').should('contain', '2.000.000');
      cy.get('[data-testid=kpi-platformBalance]').should('contain', '6.670.000');
      cy.contains('tr', 'Rút về ngân hàng').should('contain', 'Thực tế');
      cy.contains('tr', 'DH-1018').should('contain', 'Đơn tạo tay');
      cy.findByRole('tab', { name: 'Đã thay' }).click();
      cy.contains('Không có dòng sổ nào');
    });

    it('kiện sàn giao xong ghi ước tính; sàn quyết toán thay dòng, lệch thuế', () => {
      giaoDH1015();
      diToi('/c/cmp-001/sales/orders/ord-1015');
      tienDon().should('contain', 'Ước tính').and('contain', 'Thực nhận').and('contain', 'Giá vốn').and('contain', 'Lãi đóng góp');
      tienDon().should('not.contain', 'Lệch thuế');

      diToi('/c/cmp-001/dev/marketplace');
      phat('finance.order_settled', 'DH-1015 9999 20000');
      cy.toast(/DH-1015: thay 4 dòng ước tính/);

      diToi('/c/cmp-001/sales/orders/ord-1015');
      tienDon().should('contain', 'Theo quyết toán').and('contain', 'Lệch thuế');
      tienDon().contains('Quảng cáo').parent().should('contain', '-20.000');

      tienDon().contains('dòng sổ của đơn').click();
      cy.findByRole('tab', { name: 'Đã thay' }).click();
      cy.get('tbody tr').should('have.length', 4);
      cy.get('tbody tr').first().find('.line-through').should('exist');
      cy.findByRole('tab', { name: 'Thực tế' }).click();
      cy.contains('tr', 'Thuế khấu trừ').should('contain', '-9.999').and('contain', 'TXN-DH-1015');

      cy.findByRole('tab', { name: 'Lãi theo đơn' }).click();
      cy.contains('tr', 'DH-1015').should('contain', 'Theo quyết toán').and('contain', 'Lệch thuế');
    });

    it('đơn tạo tay đã giao: tiền thực tế, có giá vốn', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1018');
      tienDon().should('contain', 'Theo quyết toán').and('contain', 'Lãi gộp');
    });
  });

  context('Kế toán', () => {
    beforeEach(() => cy.dangNhap('ketoan@commerio.vn', 'ketoan'));

    it('không thấy giá vốn, xuất được chứng từ', () => {
      cy.visit('/c/cmp-001/finance/ledger');
      cy.contains('tr', 'DH-1018');
      cy.contains('td', 'Giá vốn').should('not.exist');
      cy.findByRole('button', { name: 'Xuất chứng từ kiểu MISA' }).click();
      cy.toast('Đã xuất chứng từ');
      cy.findByRole('tab', { name: 'Lãi theo đơn' }).click();
      cy.contains('tr', 'DH-1018').should('not.contain', 'Lãi gộp');

      diToi('/c/cmp-001/sales/orders/ord-1018');
      tienDon().should('contain', 'Thực nhận').and('contain', 'Cần quyền xem giá vốn').and('not.contain', 'Lãi gộp');
    });
  });

  context('Sale', () => {
    beforeEach(() => cy.dangNhap('sale@commerio.vn', 'sale'));

    it('không có quyền sổ tiền', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1018');
      cy.contains('h1', 'DH-1018');
      cy.get('[data-testid=order-profit]').should('not.exist');
      cy.findByRole('link', { name: 'Sổ tiền' }).should('not.exist');
      cy.visit('/c/cmp-001/finance/ledger');
      cy.contains(CHAN_QUYEN);
    });
  });
});
