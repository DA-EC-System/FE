// P2 · Cách ly dữ liệu: công ty này không thấy dữ liệu công ty khác (docs/21 C4: trả 404 như không có)
// Bản ghi mẫu của Mỹ phẩm XYZ (cmp-002): sản phẩm prd-101 "Gạo ST25", bảng giá pl-std-002, phiếu sd-101

describe('P2 · Cách ly dữ liệu giữa các công ty', () => {
  beforeEach(() => {
    cy.dangNhap('ceo@commerio.vn', 'ceo');
  });

  it('danh sách sản phẩm, tồn kho không lẫn dữ liệu công ty khác', () => {
    cy.menu('Sản phẩm');
    cy.get('tbody tr[data-row-id]').should('have.length.greaterThan', 0);
    cy.get('tbody').should('not.contain', 'Gạo ST25');
    cy.findByRole('searchbox').type('Gạo');
    cy.get('tbody').should('contain', 'Không tìm thấy sản phẩm phù hợp');

    cy.menu('Kho');
    cy.dong('prd-001-v1').should('exist');
    cy.dong('prd-101-v1').should('not.exist');
  });

  it('mở thẳng bản ghi của công ty khác thì báo không tìm thấy', () => {
    cy.visit('/c/cmp-001/catalog/products/prd-101');
    cy.findByRole('heading', { level: 1, name: 'Không tìm thấy' });
    cy.get('main').should('not.contain', 'Gạo ST25');

    cy.visit('/c/cmp-001/pricing/pl-std-002');
    cy.contains('Không tìm thấy');
    cy.get('[data-price-input]').should('not.exist');

    cy.visit('/c/cmp-001/inventory/documents/sd-101');
    cy.contains('Không tìm thấy');
    cy.findByTestId('doc-lines').should('not.exist');
  });

  it('mở khu làm việc của công ty mình không thuộc thì không vào được', () => {
    cy.visit('/c/cmp-002/catalog');
    cy.location('pathname').should('not.match', /^\/c\/cmp-002\/catalog/);
    cy.get('body').should('not.contain', 'Gạo ST25');
  });
});
