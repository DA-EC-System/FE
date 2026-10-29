// FE#99: response đúng hợp đồng BE; bảng và khu kết nối tải độc lập.
describe('P3 · Danh sách sàn kết nối được', () => {
  beforeEach(() => cy.dangNhap('ceo@commerio.vn', 'ceo'));

  it('chỉ hiện sàn connectable API trả, dùng tên API và không cần gợi ý viết cứng', () => {
    cy.mockApi('get', '/channel/shops/platforms', 200, { items: [
      { platform: 'lazada', name: 'Lazada từ API', connectable: true },
      { platform: 'new-market', name: 'Sàn mới', connectable: true },
      { platform: 'shopee', name: 'Shopee', connectable: false },
    ] });
    cy.menu('Kênh bán');
    cy.findByRole('button', { name: 'Thêm gian hàng' }).click();
    cy.get('[data-testid=connect-section] [data-platform]').should('have.length', 2);
    cy.get('[data-testid=connect-section]').within(() => {
      cy.findByRole('button', { name: 'Kết nối Lazada từ API' }).should('exist');
      cy.findByRole('button', { name: 'Kết nối Sàn mới' }).should('exist');
      cy.contains('Shopee').should('not.exist');
      cy.contains('TikTok').should('not.exist');
      // API chưa trả methods thì chỉ có đăng nhập sàn
      cy.findByRole('button', { name: /^Dán token/ }).should('not.exist');
    });
  });

  it('nút trên thẻ theo methods: chỉ token thì không có Đăng nhập', () => {
    cy.mockApi('get', '/channel/shops/platforms', 200, { items: [
      { platform: 'lazada', name: 'Lazada', connectable: true, methods: ['oauth', 'token'] },
      { platform: 'mock', name: 'Sàn giả lập (mock)', connectable: true, methods: ['token'] },
    ] });
    cy.menu('Kênh bán');
    cy.findByRole('button', { name: 'Thêm gian hàng' }).click();
    cy.get('[data-platform=lazada]').within(() => {
      cy.findByRole('button', { name: 'Kết nối Lazada' }).should('contain', 'Đăng nhập Lazada');
      cy.findByRole('button', { name: 'Dán token Lazada' }).should('exist');
    });
    cy.get('[data-platform=mock]').within(() => {
      cy.findByRole('button', { name: /^Kết nối/ }).should('not.exist');
      cy.findByRole('button', { name: 'Dán token Sàn giả lập (mock)' }).should('exist');
    });
  });

  it('dán token: bắt buộc access token, sàn từ chối thì ở lại, đúng thì sang thiết lập', () => {
    cy.menu('Kênh bán');
    cy.findByRole('button', { name: 'Thêm gian hàng' }).click();
    cy.findByRole('button', { name: 'Dán token Sàn giả lập (mock)' }).click();
    cy.get('[data-testid=token-form]').within(() => {
      cy.findByRole('button', { name: 'Kết nối' }).click();
      cy.contains('Nhập access token').should('be.visible');
      cy.findByLabelText('Access token').type('sai');
      cy.findByRole('button', { name: 'Kết nối' }).click();
      cy.contains('Sàn từ chối token này').should('be.visible');
      cy.findByRole('button', { name: 'Chọn sàn khác' }).click();
    });
    cy.get('[data-testid=token-form]').should('not.exist');
    cy.findByRole('button', { name: 'Dán token Sàn giả lập (mock)' }).click();
    cy.findByLabelText('Access token').type('tok-abc123');
    cy.get('[data-testid=token-form]').findByRole('button', { name: 'Kết nối' }).click();
    cy.toast('Đã kết nối Shop thử ABC123. Hoàn tất thiết lập để bắt đầu bán.');
    cy.location('pathname').should('match', /\/setup$/);
  });

  it('rỗng hiện hướng dẫn, đóng hộp thoại thì về bảng gian hàng', () => {
    cy.mockApi('get', '/channel/shops/platforms', 200, { items: [] });
    cy.menu('Kênh bán');
    cy.findByRole('button', { name: 'Thêm gian hàng' }).click();
    cy.contains('Chưa có sàn nào được bật. Liên hệ quản trị nền tảng để kết nối sàn mới.').should('be.visible');
    cy.get('[data-testid=connect-section] [data-platform]').should('not.exist');
    cy.get('body').type('{esc}');
    cy.get('[data-testid=connect-section]').should('not.exist');
    cy.dong('shp-001').should('be.visible');
  });

  it('lỗi chỉ ảnh hưởng khu kết nối, thử lại nạp được bốn sàn mock', () => {
    cy.mockApi('get', '/channel/shops/platforms', 503, { status: 503, detail: 'Chưa tải được sàn' });
    cy.menu('Kênh bán');
    cy.dong('shp-001').should('exist');
    cy.findByRole('button', { name: 'Thêm gian hàng' }).click();
    cy.get('[data-testid=connect-section]').within(() => {
      cy.get('[data-platform]').should('not.exist');
      cy.findByRole('button', { name: 'Thử lại' }).click();
      cy.get('[data-platform]').should('have.length', 4);
    });
  });

  it('lọc từ toàn bộ items, gồm sàn ở trang sau và gian hàng đã ngắt', () => {
    const items = Array.from({ length: 31 }, (_, i) => ({
      id: `demo-${i}`, companyId: 'cmp-001', shopName: `Cửa hàng ${i}`, externalShopId: `SELLER-${i}`,
      platform: i === 30 ? 'mock' : 'lazada', status: i === 30 ? 'disconnected' : 'active',
      region: 'VN', accessExpiresAt: null, refreshExpiresAt: null, orderCutoffAt: null, pendingJobs: 0,
      listingCount: 0, version: 1, createdAt: '2026-10-29T00:00:00Z', updatedAt: '2026-10-29T00:00:00Z',
    }));
    cy.mockApi('get', '/channel/shops', 200, { items });
    cy.mockApi('get', '/channel/shops/platforms', 200, { items: [{ platform: 'shopee', name: 'Shopee', connectable: true }] });
    cy.menu('Kênh bán');
    cy.get('tbody tr[data-row-id]').should('have.length', 25);
    cy.findByRole('combobox', { name: 'Sàn' }).click();
    cy.findByRole('option', { name: 'Shopee', exact: true }).should('not.exist');
    cy.findByRole('option', { name: 'Sàn giả lập (mock)', exact: true }).click();
    cy.dong('demo-30').should('exist');
    cy.get('tbody tr[data-row-id]').should('have.length', 1);
    cy.findByPlaceholderText('Tìm theo tên hoặc mã gian hàng...').type('seller-30');
    cy.dong('demo-30').should('exist');
    cy.chon('Sàn', 'Lazada');
    cy.contains('Không có gian hàng khớp bộ lọc').should('be.visible');
  });
});

describe('P3 · Sàn kết nối được: thiếu quyền kết nối', () => {
  it('Sale xem được bảng gian hàng nhưng không có nút Thêm gian hàng', () => {
    cy.dangNhap('sale@commerio.vn', 'sale');
    cy.menu('Kênh bán');
    cy.dong('shp-001').should('exist');
    cy.findByRole('button', { name: 'Thêm gian hàng' }).should('not.exist');
    cy.findByRole('button', { name: /^Kết nối / }).should('not.exist');
  });
});
