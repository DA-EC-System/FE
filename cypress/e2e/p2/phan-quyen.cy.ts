// P2 · Phân quyền theo vai trò (docs/21 mục 8): mỗi vai trò chỉ thấy, chỉ làm được phần của mình

const KHONG_CO_QUYEN = 'Vai trò của bạn trong công ty này không có quyền mở trang này.';
const coMenu = (label: string) => cy.contains('[data-sidebar="menu-button"]', new RegExp(`^\\s*${label}\\s*$`));
const khongCoMenu = (label: string) =>
  cy.get('[data-sidebar="menu-button"]').each(($el) => expect($el.text().trim()).not.to.eq(label));

describe('P2 · Phân quyền', () => {
  it('Sale: xem sản phẩm và bảng giá, không sửa; không vào Kho', () => {
    cy.dangNhap('sale@commerio.vn', 'sale');
    coMenu('Sản phẩm');
    coMenu('Bảng giá');
    khongCoMenu('Danh mục & thuộc tính');
    khongCoMenu('Kho');

    cy.menu('Sản phẩm');
    cy.contains('tbody tr', 'Áo polo nam').should('exist');
    cy.findByRole('button', { name: 'Thêm sản phẩm' }).should('not.exist');
    cy.findByRole('button', { name: 'Xoá' }).should('not.exist');
    cy.contains('tbody tr', 'Áo polo nam').click();
    cy.get('input[name=name]').should('have.attr', 'readonly');
    cy.findByRole('button', { name: 'Lưu' }).should('not.exist');
    cy.findByRole('button', { name: 'Thêm biến thể' }).should('not.exist');

    cy.menu('Bảng giá');
    cy.findByRole('button', { name: 'Tạo bảng giá' }).should('not.exist');
    cy.dong('pl-std-001').click();
    cy.get('main').should('contain', 'Bạn chỉ có quyền xem bảng giá.');
    cy.get('[data-price-input]').should('not.exist');
    cy.findByRole('button', { name: /^Lưu/ }).should('not.exist');

    cy.visit('/c/cmp-001/inventory');
    cy.contains(KHONG_CO_QUYEN);
    cy.visit('/c/cmp-001/catalog/setup');
    cy.findByRole('button', { name: 'Thêm danh mục' }).should('not.exist');
  });

  it('Nhân viên kho: lập phiếu, không thấy giá vốn, không đặt ngưỡng, không xem bảng giá', () => {
    cy.dangNhap('kho@commerio.vn', 'kho');
    khongCoMenu('Bảng giá');
    cy.menu('Kho');
    cy.dong('prd-001-v1').should('exist');
    cy.get('thead').should('not.contain', 'Giá vốn BQ').and('not.contain', 'Giá trị tồn');
    cy.findByRole('button', { name: 'Đặt ngưỡng' }).should('not.exist');
    cy.findByRole('tab', { name: 'Phiếu nhập/xuất' }).click();
    cy.findByRole('button', { name: 'Lập phiếu nhập' }).should('exist');
    cy.visit('/c/cmp-001/pricing');
    cy.contains(KHONG_CO_QUYEN);
  });

  it('Admin: đặt ngưỡng được, không thấy giá vốn, không lập phiếu', () => {
    cy.dangNhap('admin@commerio.vn', 'admin');
    cy.menu('Kho');
    cy.dong('prd-001-v1').should('exist');
    cy.get('thead').should('not.contain', 'Giá vốn BQ');
    cy.get('main').should('not.contain', 'Giá trị tồn');
    cy.dong('prd-001-v1').findByRole('button', { name: 'Đặt ngưỡng' }).should('exist');
    cy.findByRole('tab', { name: 'Nhập hoàn' }).should('not.exist');
    cy.findByRole('tab', { name: 'Phiếu nhập/xuất' }).click();
    cy.findByRole('button', { name: /Lập phiếu/ }).should('not.exist');
    cy.contains('tbody tr', 'PN-000003').click();
    cy.findByTestId('doc-lines').should('exist');
    cy.findByRole('button', { name: /Ghi sổ|Lưu nháp|Huỷ phiếu/ }).should('not.exist');
    cy.visit('/c/cmp-001/inventory/documents/new?type=receipt');
    cy.get('main').should('contain', 'Bạn không có quyền lập phiếu kho.');
  });

  it('CEO: thấy giá vốn và đủ thao tác', () => {
    cy.dangNhap('ceo@commerio.vn', 'ceo');
    coMenu('Danh mục & thuộc tính');
    cy.menu('Kho');
    cy.get('thead').should('contain', 'Giá vốn BQ').and('contain', 'Giá trị tồn');
    cy.findByRole('tab', { name: 'Phiếu nhập/xuất' }).click();
    cy.findByRole('button', { name: 'Lập phiếu nhập' }).should('exist');
    cy.findByRole('button', { name: 'Lập phiếu xuất' }).should('exist');
  });
});
