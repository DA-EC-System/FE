// P3 · Gian hàng: kết nối OAuth, ghép SKU, đẩy sản phẩm và giá (UC-CH-01, UC-CH-02; FE#8)

const moTrangGhep = (shopId: string) => {
  cy.dong(shopId).findByRole('button', { name: 'Ghép SKU' }).click();
  cy.location('pathname').should('match', new RegExp(`/channel/shops/${shopId}$`));
  cy.get('[data-testid=match-summary]').should('exist');
};

const trangThai = (shopId: string) => cy.dong(shopId).find('[data-testid=shop-status]');

describe('P3 · Gian hàng', () => {
  context('kết nối gian hàng (UC-CH-01)', () => {
    beforeEach(() => {
      cy.dangNhap('ceo@commerio.vn', 'ceo');
      cy.menu('Kênh bán');
      cy.dong('shp-001').should('exist');
    });

    it('danh sách hiện trạng thái, hạn token và số SKU đã ghép', () => {
      trangThai('shp-001').should('have.text', 'Đã kết nối');
      trangThai('shp-002').should('have.text', 'Sắp hết hạn');
      cy.dong('shp-002').should('contain', 'Hết hạn');
      trangThai('shp-008').should('have.text', 'Đã ngắt');
      cy.dong('shp-001').should('contain', '2');
      // Gian hàng của công ty khác không lộ ra
      cy.get('tbody').should('not.contain', 'XYZ Beauty Shopee');
      // Gian hàng đã ngắt không đồng bộ được, kết nối lại được
      cy.dong('shp-008').within(() => {
        cy.findByRole('button', { name: 'Đồng bộ đơn' }).should('not.exist');
        cy.findByRole('button', { name: 'Kết nối lại' }).should('exist');
        cy.findByRole('button', { name: 'Ngắt kết nối' }).should('not.exist');
      });
    });

    it('kết nối gian hàng mới qua sàn giả lập', () => {
      cy.get('[data-testid=connect-section]').findByRole('button', { name: 'Kết nối Sàn giả lập (mock)' }).click();
      cy.location('pathname').should('eq', '/mock-oauth/authorize');
      cy.contains('Uỷ quyền ứng dụng');
      cy.findByLabelText('Tên gian hàng').clear();
      cy.findByRole('button', { name: 'Đồng ý' }).click();
      cy.contains('Nhập tên gian hàng');
      cy.findByLabelText('Tên gian hàng').type('ABC Thử nghiệm');
      cy.findByLabelText('Mã gian hàng trên sàn').clear().type('mock-abc-01');
      cy.findByRole('button', { name: 'Đồng ý' }).click();
      cy.toast('Đã kết nối ABC Thử nghiệm');
      cy.location('pathname').should('eq', '/c/cmp-001/channel/shops');
      cy.contains('tbody tr', 'ABC Thử nghiệm').should('contain', 'mock-abc-01').and('contain', 'Đã kết nối');
    });

    it('từ chối uỷ quyền thì không tạo gian hàng', () => {
      cy.get('tbody tr[data-row-id]').its('length').then((n) => {
        cy.get('[data-testid=connect-section]').findByRole('button', { name: 'Kết nối Shopee' }).click();
        cy.findByRole('button', { name: 'Từ chối' }).click();
        cy.toast('Bạn đã từ chối uỷ quyền');
        cy.location('pathname').should('eq', '/c/cmp-001/channel/shops');
        cy.get('tbody tr[data-row-id]').should('have.length', n);
      });
    });

    it('kết nối lại gian hàng đã ngắt; uỷ quyền nhầm gian hàng thì báo lỗi', () => {
      cy.dong('shp-008').findByRole('button', { name: 'Kết nối lại' }).click();
      cy.findByLabelText('Tên gian hàng').should('have.value', 'ABC Outlet TikTok');
      cy.findByLabelText('Mã gian hàng trên sàn').clear().type('shop-khac');
      cy.findByRole('button', { name: 'Đồng ý' }).click();
      cy.toast(/không phải/);
      trangThai('shp-008').should('have.text', 'Đã ngắt');

      cy.dong('shp-008').findByRole('button', { name: 'Kết nối lại' }).click();
      cy.findByRole('button', { name: 'Đồng ý' }).click();
      cy.toast('Đã kết nối lại ABC Outlet TikTok');
      trangThai('shp-008').should('have.text', 'Đã kết nối');
    });

    it('callback có state lạ thì báo phiên không hợp lệ', () => {
      cy.dong('shp-001').should('exist');
      cy.window().then((win) => {
        win.history.pushState({}, '', '/channel/oauth/callback?code=abc&state=st-gia');
        win.dispatchEvent(new PopStateEvent('popstate'));
      });
      cy.toast('Phiên kết nối đã hết hạn hoặc không hợp lệ');
      cy.location('pathname').should('eq', '/c/cmp-001/channel/shops');
    });

    it('ngắt kết nối có xác nhận', () => {
      cy.dong('shp-001').findByRole('button', { name: 'Ngắt kết nối' }).click();
      cy.findByRole('alertdialog').within(() => {
        cy.contains('ABC Fashion Official');
        cy.findByRole('button', { name: 'Ngắt kết nối' }).click();
      });
      cy.toast('Đã ngắt kết nối ABC Fashion Official');
      trangThai('shp-001').should('have.text', 'Đã ngắt');
    });
  });

  context('ghép SKU và đẩy giá (UC-CH-02)', () => {
    beforeEach(() => {
      cy.dangNhap('ceo@commerio.vn', 'ceo');
      cy.menu('Kênh bán');
      moTrangGhep('shp-001');
    });

    it('hiện giá đẩy theo nguồn và trạng thái đẩy từng biến thể', () => {
      cy.get('[data-testid=match-summary]').should('contain', 'Đã ghép 2 /');
      cy.dong('prd-001-v1').should('contain', '165.000').and('contain', 'Giá gian hàng').and('contain', 'Đã đẩy');
      cy.dong('prd-001-v2').should('contain', 'Giá đã đổi, chưa đẩy').and('contain', '150.000');
      cy.dong('prd-001-v3').should('contain', 'Theo giá chuẩn').and('contain', 'Chưa ghép');
      cy.dong('prd-002-v3').should('contain', 'Chưa có giá');
      cy.chon('Ghép', 'Giá chưa đẩy');
      cy.get('tbody tr[data-row-id]').should('have.length', 1);
      cy.dong('prd-001-v2').should('exist');
      cy.get('[data-testid=remote-section]').should('contain', 'OLD-TEE-01');
    });

    it('ghép biến thể với SKU sàn được gợi ý theo SKU người bán', () => {
      cy.dong('prd-001-v3').findByRole('button', { name: 'Ghép' }).click();
      cy.findByRole('dialog').within(() => {
        cy.contains('Gợi ý');
        cy.findByRole('radio', { checked: true }).should('have.attr', 'value', 'shp-001-sku-003');
        cy.findByRole('button', { name: 'Lưu ghép' }).click();
      });
      cy.toast('Đã ghép');
      cy.findByRole('dialog').should('not.exist');
      cy.dong('prd-001-v3').find('[data-testid=remote-sku]').should('contain', 'shp-001-sku-003');
      cy.get('[data-testid=remote-section]').should('not.contain', 'shp-001-sku-003');
      cy.get('[data-testid=match-summary]').should('contain', 'Đã ghép 3 /');
    });

    it('SKU sàn đã bị ghép thì báo trong hộp; xung đột phiên bản thì nạp lại', () => {
      cy.mockApi('put', '/channel/shops/shp-001/listings/prd-001-v4', 409, {
        status: 409,
        title: 'SKU sàn đã được ghép',
        code: 'sku_taken',
      });
      cy.dong('prd-001-v4').findByRole('button', { name: 'Ghép' }).click();
      cy.findByRole('dialog').within(() => {
        cy.findByRole('button', { name: 'Lưu ghép' }).click();
        cy.contains('SKU sàn này đã ghép với biến thể khác');
      });

      cy.mockApi('put', '/channel/shops/shp-001/listings/prd-001-v4', 409, {
        status: 409,
        title: 'Xung đột phiên bản',
        code: 'version_conflict',
      });
      cy.findByRole('dialog').findByRole('button', { name: 'Lưu ghép' }).click();
      cy.toast('vừa được người khác sửa');
      cy.findByRole('dialog').should('not.exist');
      cy.dong('prd-001-v4').should('contain', 'Chưa ghép');
    });

    it('ghép từ SKU sàn chưa ghép và bỏ ghép có xác nhận', () => {
      cy.get('[data-testid=remote-section]')
        .contains('tr', 'OLD-TEE-01')
        .findByRole('button', { name: 'Ghép với biến thể' })
        .click();
      cy.findByRole('dialog').within(() => {
        cy.findByPlaceholderText('Tìm biến thể theo tên hoặc SKU...').type('Thắt lưng');
        cy.findAllByRole('radio').should('have.length', 1).click();
        cy.findByRole('button', { name: 'Lưu ghép' }).click();
      });
      cy.toast('Đã ghép');
      cy.dong('prd-003-v1').find('[data-testid=remote-sku]').should('contain', 'OLD-TEE-01');

      cy.dong('prd-003-v1').findByRole('button', { name: 'Bỏ ghép' }).click();
      cy.findByRole('alertdialog').findByRole('button', { name: 'Bỏ ghép' }).click();
      cy.toast('Đã bỏ ghép');
      cy.dong('prd-003-v1').should('contain', 'Chưa ghép');
      cy.get('[data-testid=remote-section]').should('contain', 'OLD-TEE-01');
    });

    it('đẩy nhiều biến thể: biến thể chưa ghép được tạo mới trên sàn', () => {
      cy.dong('prd-001-v2').findByRole('checkbox').click();
      cy.dong('prd-002-v2').findByRole('checkbox').click();
      cy.findByRole('button', { name: 'Đẩy 2 biến thể lên sàn' }).click();
      cy.findByRole('alertdialog').within(() => {
        cy.contains('1 biến thể chưa có SKU sàn');
        cy.findByRole('button', { name: 'Đẩy lên sàn' }).click();
      });
      cy.toast('Đã đẩy 2 biến thể lên sàn (1 tạo mới)');
      cy.dong('prd-001-v2').should('contain', 'Đã đẩy').and('not.contain', 'Giá đã đổi');
      cy.dong('prd-002-v2').find('[data-testid=remote-sku]').should('exist');
      cy.dong('prd-002-v2').should('contain', 'Đã đẩy');
    });

    it('biến thể chưa có giá thì báo lỗi theo dòng', () => {
      cy.dong('prd-002-v3').findByRole('button', { name: 'Đẩy sản phẩm mới' }).click();
      cy.findByRole('alertdialog').findByRole('button', { name: 'Đẩy lên sàn' }).click();
      cy.toast('1 biến thể không đẩy được');
      cy.dong('prd-002-v3').find('[data-testid=push-error]').should('contain', 'Chưa có giá');
      cy.dong('prd-002-v3').should('contain', 'Chưa ghép');
    });
  });

  it('gian hàng đã ngắt chỉ xem được ghép cũ', () => {
    cy.dangNhap('ceo@commerio.vn', 'ceo');
    cy.menu('Kênh bán');
    moTrangGhep('shp-008');
    cy.contains('chỉ xem được ghép SKU cũ');
    cy.findByRole('button', { name: 'Kết nối lại' }).should('exist');
    cy.findByRole('button', { name: /Đẩy/ }).should('not.exist');
    cy.dong('prd-001-v1').findByRole('checkbox').should('not.exist');
    cy.get('[data-testid=remote-section]').should('contain', 'chưa kết nối');
  });

  it('Sale chỉ xem: không kết nối, không ghép, không đẩy', () => {
    cy.dangNhap('sale@commerio.vn', 'sale');
    cy.menu('Kênh bán');
    cy.get('[data-testid=connect-section]').should('not.exist');
    cy.dong('shp-001').within(() => {
      cy.findByRole('button', { name: 'Ngắt kết nối' }).should('not.exist');
      cy.findByRole('button', { name: 'Đồng bộ đơn' }).should('not.exist');
    });
    moTrangGhep('shp-001');
    cy.contains('Bạn chỉ có quyền xem ghép SKU');
    cy.findByRole('button', { name: /Đẩy/ }).should('not.exist');
    cy.dong('prd-001-v3').findByRole('button', { name: 'Ghép' }).should('not.exist');
    cy.get('[data-testid=remote-section]').findByRole('button', { name: 'Ghép với biến thể' }).should('not.exist');
  });

  it('không mở được gian hàng của công ty khác', () => {
    cy.dangNhap('ceo@commerio.vn', 'ceo');
    cy.menu('Kênh bán');
    cy.dong('shp-001').should('exist');
    cy.window().then((win) => {
      win.history.pushState({}, '', '/c/cmp-001/channel/shops/shp-004');
      win.dispatchEvent(new PopStateEvent('popstate'));
    });
    cy.findByRole('button', { name: 'Về danh sách gian hàng' }).click();
    cy.location('pathname').should('eq', '/c/cmp-001/channel/shops');
  });
});

export {};
