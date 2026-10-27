// P2 · Sản phẩm, danh mục, thuộc tính (UC-CP-01, 02; FE#5, commerio-backend#12, #14)

const tenCot = () => cy.get('tbody tr[data-row-id]');
/** Mở menu trạng thái của sản phẩm trên danh sách rồi xác nhận */
const doiTrangThai = (ten: string, thaoTac: string) => {
  cy.findByRole('button', { name: `Đổi trạng thái ${ten}` }).click();
  cy.findByRole('menuitem', { name: thaoTac }).click();
  cy.findByRole('alertdialog').findByRole('button', { name: thaoTac }).click();
};

describe('P2 · Sản phẩm', () => {
  beforeEach(() => {
    cy.dangNhap('ceo@commerio.vn', 'ceo');
    cy.menu('Sản phẩm');
    cy.get('tbody tr[data-row-id]').should('have.length.greaterThan', 0);
  });

  it('danh sách chỉ có sản phẩm đang bán, tìm được theo tên và SKU', () => {
    tenCot().should('contain', 'Áo polo nam').and('not.contain', 'Áo sơ mi caro');
    cy.findByRole('searchbox').type('polo');
    tenCot().should('have.length', 1).and('contain', 'Áo polo nam');
    cy.findByRole('searchbox').clear().type('0012');
    tenCot().should('have.length', 1).and('contain', 'Áo khoác gió');
    cy.findByRole('searchbox').clear().type('không có sản phẩm này');
    cy.get('tbody').should('contain', 'Không tìm thấy sản phẩm phù hợp');
  });

  it('tạo sản phẩm có biến thể, SKU cấp theo quy tắc danh mục', () => {
    cy.findByRole('button', { name: 'Thêm sản phẩm' }).click();
    cy.location('pathname').should('match', /\/catalog\/products\/new$/);

    // Bỏ trống thì báo tại ô
    cy.findByRole('button', { name: 'Tạo sản phẩm' }).click();
    cy.get('[data-slot="form-item"]:has([name=name]) [data-slot="form-message"]').should('not.be.empty');

    cy.chon('Danh mục', 'Áo');
    cy.findByRole('group', { name: 'Thuộc tính' }).within(() => {
      cy.findByRole('button', { name: 'Màu sắc' }).click();
      cy.findByRole('button', { name: 'Kích cỡ' }).click();
    });
    cy.findByRole('group', { name: 'Màu sắc' }).within(() => {
      cy.findByRole('button', { name: 'Đen' }).click();
      cy.findByRole('button', { name: 'Trắng' }).click();
    });
    cy.findByRole('group', { name: 'Kích cỡ' }).within(() => {
      cy.findByRole('button', { name: 'S' }).click();
      cy.findByRole('button', { name: 'M' }).click();
    });
    cy.findByRole('checkbox', { name: 'Tạo biến thể Đen / M' }).click();
    cy.get('[data-testid=variant-plan] tbody tr').should('have.length', 4);

    // Tên trùng (409 name_taken) báo dưới ô Tên
    cy.get('input[name=name]').type('áo polo nam');
    cy.findByRole('button', { name: 'Tạo sản phẩm' }).click();
    cy.get('[data-slot="form-item"]:has([name=name]) [data-slot="form-message"]').should(
      'have.text',
      'Đã có sản phẩm cùng tên',
    );

    cy.get('input[name=name]').clear().type('Áo sơ mi Oxford');
    cy.findByRole('button', { name: 'Tạo sản phẩm' }).click();
    cy.toast('Đã tạo Áo sơ mi Oxford với 3 biến thể');
    cy.location('pathname').should('match', /\/catalog\/products\/prd-/);
    cy.get('[data-testid=variants] tbody tr td:first-child').then(($td) => {
      expect([...$td].map((td) => td.innerText.trim())).to.deep.equal([
        'AO-0013-DEN-S',
        'AO-0014-TRANG-S',
        'AO-0015-TRANG-M',
      ]);
    });
    // Đã tạo thì không đổi được danh mục (SKU đã cấp theo danh mục)
    cy.findByRole('combobox', { name: 'Danh mục' }).should('be.disabled');
  });

  it('sửa sản phẩm bị người khác sửa trước thì nạp bản mới nhất', () => {
    cy.contains('tbody tr', 'Áo polo nam').click();
    cy.get('[data-testid=variants] tbody tr').should('have.length.greaterThan', 0);
    cy.get('input[name=name]').clear().type('Áo polo nam – sửa dở');
    cy.mockApi('put', '/catalog/products/:id', 409, {
      status: 409,
      title: 'Xung đột phiên bản',
      code: 'version_conflict',
      current: null,
    });
    cy.findByRole('button', { name: 'Lưu' }).click();
    cy.contains('[role=status]', 'vừa được người khác sửa');
  });

  it('ngừng nhập rồi lưu trữ cả sản phẩm, lưu trữ thì chỉ còn xem (B1)', () => {
    doiTrangThai('Áo khoác gió', 'Ngừng nhập');
    cy.toast('Ngừng nhập: 4 SKU của Áo khoác gió');
    cy.contains('tbody tr', 'Áo khoác gió').findByTestId('product-status').should('contain', 'Ngừng nhập');

    doiTrangThai('Áo khoác gió', 'Lưu trữ');
    cy.toast('Lưu trữ: 4 SKU của Áo khoác gió');
    tenCot().should('not.contain', 'Áo khoác gió');
    cy.chon('Trạng thái', 'Đã lưu trữ');
    cy.contains('tbody tr', 'Áo khoác gió').click();
    cy.contains('[role=status]', 'chỉ xem được');
    cy.findByRole('button', { name: 'Lưu' }).should('not.exist');
    cy.findByRole('button', { name: 'Thêm biến thể' }).should('not.exist');
  });

  it('SKU còn tồn và chứng từ mở thì Lưu trữ bị khoá, báo lý do (B1)', () => {
    cy.contains('tbody tr', 'Quần kaki ống suông').click();
    const dong = () => cy.get('[data-testid=variants] tr[data-row-id=prd-002-v1]');
    dong().findByRole('button', { name: /^Đổi trạng thái/ }).click();
    cy.findByRole('menuitem', { name: 'Ngừng nhập' }).click();
    cy.findByRole('alertdialog').findByRole('button', { name: 'Ngừng nhập' }).click();
    dong().findByTestId('variant-status').should('contain', 'Ngừng nhập');

    dong().findByRole('button', { name: /^Đổi trạng thái/ }).click();
    cy.findByRole('menuitem', { name: /^Lưu trữ/ })
      .should('have.attr', 'aria-disabled', 'true')
      .findByTestId('archive-blockers')
      .should('contain', 'tồn thực')
      .and('contain', 'Còn chứng từ mở');
  });

  it('tạm ngừng một SKU rồi bỏ tạm ngừng (B1)', () => {
    cy.contains('tbody tr', 'Áo thun basic cổ tròn').click();
    const dong = () => cy.get('[data-testid=variants] tr[data-row-id=prd-001-v1]');
    dong().findByTestId('variant-status').should('contain', 'Đang bán');
    dong().findByRole('button', { name: /^Đổi trạng thái/ }).click();
    cy.findByRole('menuitem', { name: 'Tạm ngừng' }).click();
    cy.findByRole('alertdialog').should('contain', 'Listing trên các sàn bị ẩn').findByRole('button', { name: 'Tạm ngừng' }).click();
    dong().findByTestId('variant-status').should('contain', 'Tạm ngừng');
    dong().findByRole('button', { name: /^Đổi trạng thái/ }).click();
    cy.findByRole('menuitem', { name: 'Lưu trữ' }).should('not.exist');
    cy.findByRole('menuitem', { name: 'Bỏ tạm ngừng' }).click();
    cy.findByRole('alertdialog').findByRole('button', { name: 'Bỏ tạm ngừng' }).click();
    dong().findByTestId('variant-status').should('contain', 'Đang bán');
  });

  it('danh mục: quy tắc SKU sai báo ngay, tên trùng báo tại ô', () => {
    cy.findByRole('button', { name: 'Danh mục & thuộc tính' }).click();
    cy.findByRole('button', { name: 'Thêm danh mục' }).click();
    cy.findByRole('dialog').within(() => {
      cy.get('input[name=skuPattern]').type('AO-{VAL}', { parseSpecialCharSequences: false });
      cy.findByTestId('sku-preview').should('contain', 'Quy tắc phải có đúng một {SEQ} để SKU không trùng');
      cy.get('input[name=skuPattern]').clear().type('TX-{SEQ:4}-{VAL}', { parseSpecialCharSequences: false });
      cy.findByTestId('sku-preview').should('contain', 'TX-0001-DEN-XL');
      cy.get('input[name=name]').type('áo');
      cy.findByRole('button', { name: 'Lưu' }).click();
      cy.get('[data-slot="form-item"]:has([name=name]) [data-slot="form-message"]').should(
        'have.text',
        'Đã có danh mục cùng tên',
      );
      cy.get('input[name=name]').clear().type('Túi xách');
      cy.findByRole('button', { name: 'Lưu' }).click();
    });
    cy.toast('Đã tạo danh mục Túi xách');
    cy.contains('tbody tr', 'Túi xách').should('contain', 'TX-{SEQ:4}-{VAL}');
  });
});

export {};
