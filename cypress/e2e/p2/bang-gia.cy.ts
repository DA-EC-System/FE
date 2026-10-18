// P2 · Bảng giá (UC-CP-03; FE#6, commerio-backend#14)

const oGia = (variantId: string) => cy.get(`[data-price-input="${variantId}"]`);

describe('P2 · Bảng giá', () => {
  beforeEach(() => {
    cy.dangNhap('ceo@commerio.vn', 'ceo');
    cy.menu('Bảng giá');
    cy.dong('pl-std-001').should('exist');
  });

  it('bảng chuẩn đứng đầu, đổi tên được nhưng không xoá được', () => {
    cy.get('tbody tr[data-row-id]').first().should('have.attr', 'data-row-id', 'pl-std-001');
    cy.dong('pl-std-001').within(() => {
      cy.findByRole('button', { name: 'Đổi tên' }).should('exist');
      cy.findByRole('button', { name: 'Xoá' }).should('not.exist');
    });
    cy.dong('pl-shp-001').findByRole('button', { name: 'Xoá' }).should('exist');
  });

  it('tạo bảng giá theo gian hàng: chỉ chọn gian hàng còn kết nối, chép giá chuẩn', () => {
    cy.findByRole('button', { name: 'Tạo bảng giá' }).click();
    cy.findByRole('dialog').within(() => {
      cy.findByRole('button', { name: 'Tạo' }).click();
      cy.contains('Chọn gian hàng');
      cy.contains('Nhập tên bảng giá');
      cy.findByRole('combobox', { name: 'Gian hàng' }).click();
    });
    // Gian hàng đã có bảng giá hoặc đã ngắt thì không chọn được
    cy.findAllByRole('option').should('have.length', 2);
    cy.findByRole('option', { name: /LazMall/ }).click();
    cy.findByRole('dialog').within(() => {
      // Chọn gian hàng thì điền sẵn tên theo gian hàng
      cy.get('input[name=name]').should('have.value', 'Giá ABC Fashion LazMall').clear().type('giá shopee');
      cy.findByRole('button', { name: 'Tạo' }).click();
      cy.contains('Đã có bảng giá cùng tên');
      cy.get('input[name=name]').clear().type('Giá LazMall');
      cy.findByRole('button', { name: 'Tạo' }).click();
    });
    cy.toast('Đã tạo Giá LazMall');
    cy.location('pathname').should('match', /\/pricing\/pl-/);
    cy.get('thead').should('contain', 'Giá chuẩn').and('contain', 'Giá gian hàng');
    oGia('prd-001-v1').should('have.value', '150.000');
    oGia('prd-003-v1').should('have.attr', 'placeholder', 'theo giá chuẩn');
  });

  context('lưới giá chuẩn', () => {
    beforeEach(() => {
      cy.dong('pl-std-001').click();
      cy.location('pathname').should('match', /\/pricing\/pl-std-001$/);
      oGia('prd-001-v1').should('exist');
    });

    it('ô giá kiểm ngay khi gõ', () => {
      const cases: [string, string][] = [
        ['-5000', 'Giá không được âm'],
        ['150000.5', 'Giá phải là số nguyên đồng, vd 150000'],
        ['abc', 'Giá phải là số nguyên đồng, vd 150000'],
        ['10000000001', 'Giá tối đa 10 tỷ đồng'],
      ];
      for (const [text, msg] of cases) {
        oGia('prd-001-v3').clear().type(text);
        cy.dong('prd-001-v3').findByTestId('price-error').should('have.text', msg);
      }
      oGia('prd-001-v3').clear().type('150.000');
      cy.dong('prd-001-v3').findByTestId('price-error').should('not.exist');
    });

    it('sửa vài ô rồi lưu một lần; sửa hàng loạt theo %', () => {
      oGia('prd-001-v1').clear().type('155000');
      oGia('prd-001-v2').clear().type('160.000');
      cy.get('[data-dirty]').should('have.length', 2);
      cy.findByRole('button', { name: /^Lưu 2 thay đổi/ }).click();
      cy.toast('Đã lưu 2 giá của Bảng giá chuẩn');
      cy.get('[data-dirty]').should('have.length', 0);

      cy.dong('prd-002-v1').findByRole('checkbox').click();
      cy.dong('prd-002-v2').findByRole('checkbox').click();
      cy.findByRole('button', { name: 'Sửa giá hàng loạt' }).click();
      cy.findByRole('dialog').within(() => {
        cy.findByRole('heading', { name: 'Sửa giá 2 biến thể' });
        cy.chon('Cách sửa', 'Tăng / giảm theo %');
        cy.get('#bulk-value').type('10');
        cy.findByRole('button', { name: 'Áp dụng' }).click();
      });
      oGia('prd-002-v1').should('have.value', '352.000');
      cy.get('[data-dirty]').should('have.length', 2);
      cy.toast('Bấm Lưu để ghi lại');
    });

    it('BE báo lỗi theo dòng thì lọc dòng đã sửa và ghi lý do', () => {
      oGia('prd-002-v1').clear().type('300000');
      cy.mockApi('put', '/pricing/pricelists/:id/items', 422, {
        status: 422,
        title: 'Dữ liệu chưa hợp lệ',
        code: 'validation_failed',
        errors: { 'items.prd-002-v1': 'Biến thể đã ngừng bán' },
      });
      cy.findByRole('button', { name: /^Lưu 1 thay đổi/ }).click();
      cy.toast('1 giá chưa hợp lệ, xem cột Ghi chú');
      cy.get('#only-changed').should('have.attr', 'aria-checked', 'true');
      cy.dong('prd-002-v1').findByTestId('row-error').should('have.text', 'Biến thể đã ngừng bán');
    });

    it('xung đột phiên bản khi lưu thì nạp giá mới nhất, giữ ô đang sửa', () => {
      oGia('prd-001-v1').clear().type('155000');
      cy.mockApi('put', '/pricing/pricelists/:id/items', 409, {
        status: 409,
        title: 'Dữ liệu đã thay đổi',
        code: 'version_conflict',
      });
      cy.findByRole('button', { name: /^Lưu 1 thay đổi/ }).click();
      cy.toast('Đã nạp giá mới nhất');
      cy.get('[data-dirty]').should('have.length', 1);
    });

    it('còn thay đổi chưa lưu thì hỏi trước khi rời trang', () => {
      oGia('prd-001-v1').clear().type('199000');
      cy.menu('Kho');
      cy.findByRole('alertdialog').within(() => {
        cy.findByRole('heading', { name: 'Rời trang khi chưa lưu?' });
        cy.findByRole('button', { name: 'Ở lại' }).click();
      });
      cy.location('pathname').should('match', /\/pricing\/pl-std-001$/);
      // Rời ô thì định dạng lại theo hàng nghìn
      oGia('prd-001-v1').should('have.value', '199.000');
    });
  });

  it('xoá: gian hàng còn kết nối thì không xoá được; đã ngắt thì xoá được', () => {
    cy.dong('pl-shp-001').findByRole('button', { name: 'Xoá' }).click();
    cy.findByRole('alertdialog').findByRole('button', { name: 'Xoá' }).click();
    cy.toast(/đang|kết nối|sử dụng/i);
    cy.dong('pl-shp-001').should('exist');

    cy.dong('pl-shp-008').findByRole('button', { name: 'Xoá' }).click();
    cy.findByRole('alertdialog').should('contain', 'Giá Outlet cũ').findByRole('button', { name: 'Xoá' }).click();
    cy.toast('Đã xoá Giá Outlet cũ');
    cy.dong('pl-shp-008').should('not.exist');
  });

});

describe('P2 · Bảng giá khi chưa bật Kênh bán', () => {
  it('chỉ có bảng giá chuẩn, không tạo được bảng giá gian hàng', () => {
    cy.dangNhap('ceo@commerio.vn', 'ceo', 'Minh Phát');
    cy.menu('Bảng giá');
    cy.get('main').should('contain', 'Công ty chưa bật phân hệ Kênh bán nên chỉ có bảng giá chuẩn.');
    cy.findByRole('button', { name: 'Tạo bảng giá' }).should('not.exist');
  });
});
