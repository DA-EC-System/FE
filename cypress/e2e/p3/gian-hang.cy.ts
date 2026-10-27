// P3 · Gian hàng: kết nối OAuth, ghép SKU, đẩy sản phẩm và giá (UC-CH-01, UC-CH-02; FE#8)
// Vòng đời gian hàng và listing theo sơ đồ C1, C2 (FE#58)

const moTrangGhep = (shopId: string) => {
  cy.dong(shopId).findByRole('button', { name: 'Ghép SKU' }).click();
  cy.location('pathname').should('match', new RegExp(`/channel/shops/${shopId}$`));
  cy.get('[data-testid=match-summary]').should('exist');
};

const trangThai = (shopId: string) => cy.dong(shopId).find('[data-testid=shop-status]');
/** Dòng biến thể ở bảng ghép (bảng SKU sàn chưa ghép bên dưới cũng có data-row-id) */
const dongBienThe = () => cy.get('tbody').first().find('tr[data-row-id]');
const trangThaiListing = (variantId: string) => cy.dong(variantId).find('[data-testid=listing-status]');

/** Chuyển trang trong app (giữ dữ liệu giả trong bộ nhớ, khác cy.visit nạp lại) */
const diToi = (path: string) =>
  cy.window().then((win) => {
    win.history.pushState({}, '', path);
    win.dispatchEvent(new PopStateEvent('popstate'));
  });

const phat = (type: string) => {
  cy.get(`[data-event="${type}"]`).findByRole('button', { name: 'Phát' }).click();
};

describe('P3 · Gian hàng', () => {
  context('kết nối gian hàng (UC-CH-01)', () => {
    beforeEach(() => {
      cy.dangNhap('ceo@commerio.vn', 'ceo');
      cy.menu('Kênh bán');
      cy.dong('shp-001').should('exist');
    });

    it('danh sách hiện trạng thái, hạn token và số SKU đã ghép', () => {
      trangThai('shp-001').should('have.text', 'Đã kết nối');
      trangThai('shp-002').should('have.text', 'Cần kết nối lại');
      cy.dong('shp-002').should('contain', '3 việc đang chờ');
      // Sắp hết hạn là nhãn phụ của gian hàng đang kết nối, không phải trạng thái
      trangThai('shp-003').should('have.text', 'Đã kết nối');
      cy.dong('shp-003').find('[data-testid=shop-expiring]').should('contain', 'Sắp hết hạn').and('contain', 'Hết hạn');
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
      cy.dong('shp-001').findByRole('button', { name: 'Kết nối lại' }).should('not.exist');
    });

    it('banner cần kết nối lại kèm số việc đang chờ', () => {
      cy.get('[data-testid=reauth-banner]')
        .should('have.length', 1)
        .and('contain', 'ABC Fashion TikTok Shop')
        .and('contain', '3 việc đang chờ');
      cy.dong('shp-002').findByRole('button', { name: 'Đồng bộ đơn' }).should('not.exist');
      cy.get('[data-testid=reauth-banner]').findByRole('button', { name: 'Kết nối lại' }).click();
      cy.findByRole('button', { name: 'Đồng ý' }).click();
      cy.toast('Đã kết nối lại ABC Fashion TikTok Shop: chạy 3 việc đang chờ');
      trangThai('shp-002').should('have.text', 'Đã kết nối');
      cy.get('[data-testid=reauth-banner]').should('not.exist');
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
      cy.toast('Đã kết nối ABC Thử nghiệm. Hoàn tất thiết lập');
      cy.location('pathname').should('match', /\/channel\/shops\/[^/]+\/setup$/);

      // Bước 1: hai SKU trên sàn trùng SKU Commerio được gợi ý, mặc định chọn cả hai
      cy.get('[data-testid=setup-suggestions] [data-suggestion]').should('have.length', 2);
      cy.get('[data-testid=setup-suggestions]').should('contain', 'Còn 1 SKU trên sàn không trùng');
      cy.get('[data-testid=setup-suggestions]').findAllByRole('checkbox').should('have.attr', 'aria-checked', 'true');
      cy.findByRole('button', { name: 'Tiếp' }).click();

      // Bước 2: số trên sàn khác khả dụng thì chọn kiểm kê lại
      cy.get('[data-testid=setup-drift] tbody tr').should('have.length.at.least', 1);
      cy.findByLabelText(/Kiểm kê lại trước/).click();
      cy.findByRole('button', { name: 'Tiếp' }).click();

      // Bước 3: mốc kéo đơn không được ở tương lai
      cy.findByLabelText('Kéo đơn từ ngày').clear().type('2099-01-01');
      cy.findByRole('button', { name: 'Hoàn tất thiết lập' }).click();
      cy.contains('Mốc kéo đơn không được ở tương lai');
      cy.findByLabelText('Kéo đơn từ ngày').clear().type('2026-04-01');
      cy.findByRole('button', { name: 'Hoàn tất thiết lập' }).click();
      cy.toast(/ABC Thử nghiệm đã sẵn sàng bán, ghép 2 listing, lập phiếu kiểm kê KK-/);
      cy.get('[data-testid=shop-status]').should('have.text', 'Đã kết nối');
      cy.get('[data-testid=listing-status]').should('have.length', 2).and('contain', 'Đang bán');
      cy.get('[data-testid=stock-sync]').should('contain', 'Tồn chờ đẩy');
    });

    it('gian hàng đang thiết lập mở thẳng wizard', () => {
      cy.get('[data-testid=connect-section]').findByRole('button', { name: 'Kết nối Shopee' }).click();
      cy.findByLabelText('Tên gian hàng').clear().type('ABC Chưa xong');
      cy.findByRole('button', { name: 'Đồng ý' }).click();
      cy.location('pathname').should('match', /\/setup$/);
      cy.findByRole('button', { name: 'Danh sách' }).should('not.exist');
      cy.menu('Kênh bán');
      cy.contains('tbody tr', 'ABC Chưa xong').within(() => {
        cy.get('[data-testid=shop-status]').should('have.text', 'Đang thiết lập');
        cy.findByRole('button', { name: 'Thiết lập' }).click();
      });
      cy.location('pathname').should('match', /\/setup$/);
      cy.contains('Thiết lập ABC Chưa xong');
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
      // Kết nối lại dùng bản ghi cũ, đưa listing đã gỡ khi ngắt lên lại và kéo đơn từ mốc cũ
      cy.toast(/Đã kết nối lại ABC Outlet TikTok: đưa lại 1 listing lên sàn, kéo đơn từ/);
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

    it('ngắt kết nối có xác nhận, hỏi đặt tồn trên sàn về 0', () => {
      cy.dong('shp-001').findByRole('button', { name: 'Ngắt kết nối' }).click();
      cy.findByRole('alertdialog').within(() => {
        cy.contains('ABC Fashion Official');
        cy.findByRole('checkbox', { name: /Đặt tồn trên sàn về 0/ }).click();
        cy.findByRole('button', { name: 'Ngắt kết nối' }).click();
      });
      cy.toast('Đã ngắt kết nối ABC Fashion Official, tồn trên sàn đã về 0');
      trangThai('shp-001').should('have.text', 'Đã ngắt');
      cy.dong('shp-001').should('contain', '0');
    });

    it('gian hàng mất quyền thì không đặt tồn về 0 được khi ngắt', () => {
      cy.dong('shp-002').findByRole('button', { name: 'Ngắt kết nối' }).click();
      cy.findByRole('alertdialog').within(() => {
        cy.findByRole('checkbox', { name: /Đặt tồn trên sàn về 0/ }).should('be.disabled');
        cy.contains('sàn đã thu hồi quyền');
        cy.findByRole('button', { name: 'Ngắt kết nối' }).click();
      });
      cy.toast('Đã ngắt kết nối ABC Fashion TikTok Shop');
      trangThai('shp-002').should('have.text', 'Đã ngắt');
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
      dongBienThe().should('have.length', 1);
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

  context('trạng thái listing (sơ đồ C2)', () => {
    beforeEach(() => {
      cy.dangNhap('ceo@commerio.vn', 'ceo');
      cy.menu('Kênh bán');
      moTrangGhep('shp-003');
    });

    it('hiện trạng thái listing, lý do từ chối và lệch tồn sàn', () => {
      trangThaiListing('prd-002-v1').should('have.text', 'Đang bán');
      cy.dong('prd-002-v1').should('contain', 'Chưa đẩy');
      trangThaiListing('prd-002-v2').should('have.text', 'Chờ sàn duyệt');
      trangThaiListing('prd-001-v3').should('have.text', 'Sàn từ chối');
      cy.dong('prd-001-v3').find('[data-testid=listing-note]').should('contain', 'Ảnh chính có chữ và logo');
      cy.dong('prd-001-v3').findByRole('button', { name: 'Đẩy lại' }).should('exist');
      cy.dong('prd-003-v1').find('[data-testid=stock-sync]').should('have.text', 'Lệch tồn sàn (sàn 12)');
      cy.chon('Trạng thái', 'Sàn từ chối');
      dongBienThe().should('have.length', 1);
      cy.chon('Trạng thái', 'Chưa lên sàn');
      dongBienThe().each(($tr) => cy.wrap($tr).should('contain', 'Chưa lên sàn'));
    });

    it('đẩy lại listing bị từ chối thì chờ sàn duyệt (Lazada)', () => {
      cy.dong('prd-001-v3').findByRole('button', { name: 'Đẩy lại' }).click();
      cy.toast('Đã đẩy 1 biến thể lên sàn');
      trangThaiListing('prd-001-v3').should('have.text', 'Chờ sàn duyệt');
      cy.dong('prd-001-v3').find('[data-testid=listing-note]').should('not.exist');
    });

    it('gỡ khỏi sàn có xác nhận, giữ ghép để đẩy lại', () => {
      cy.dong('prd-002-v1').findByRole('button', { name: 'Gỡ khỏi sàn' }).click();
      cy.findByRole('alertdialog').within(() => {
        cy.contains('ghép SKU vẫn giữ');
        cy.findByRole('button', { name: 'Gỡ khỏi sàn' }).click();
      });
      cy.toast(/Đã gỡ .* khỏi sàn/);
      trangThaiListing('prd-002-v1').should('have.text', 'Đã gỡ');
      cy.dong('prd-002-v1').find('[data-testid=remote-sku]').should('exist');
      cy.dong('prd-002-v1').findByRole('button', { name: 'Gỡ khỏi sàn' }).should('not.exist');
      cy.dong('prd-002-v1').findByRole('button', { name: 'Đẩy lại' }).click();
      trangThaiListing('prd-002-v1').should('have.text', 'Chờ sàn duyệt');
    });

    it('sàn giả lập: duyệt listing, khoá listing, thu hồi quyền', () => {
      diToi('/c/cmp-001/dev/marketplace');
      cy.chon('Gian hàng', /ABC Fashion LazMall/);
      phat('listing.approved');
      cy.toast('sàn đã duyệt');
      cy.get('[data-event="listing.hold"]').findByRole('textbox').type('khong-co');
      phat('listing.hold');
      cy.toast('Không có listing đang bán với SKU khong-co');
      phat('shop.deauthorized');
      cy.toast(/ABC Fashion LazMall chuyển sang cần kết nối lại, \d+ việc đang chờ/);

      diToi('/c/cmp-001/channel/shops/shp-003');
      trangThaiListing('prd-002-v2').should('have.text', 'Đang bán');
      cy.get('[data-testid=shop-status]').should('have.text', 'Cần kết nối lại');
      cy.get('[data-testid=stock-sync]').should('contain', 'Tồn chờ đẩy');
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
