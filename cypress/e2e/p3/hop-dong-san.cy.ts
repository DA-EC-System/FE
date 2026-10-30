export {};

const navigateCallback = (query: string) => cy.window().then((win) => {
  win.history.pushState({}, '', `/c/cmp-001/channel/shops/oauth-callback/mock?${query}`);
  win.dispatchEvent(new PopStateEvent('popstate'));
});

describe('FE #102, #103 · Hợp đồng sàn', () => {
  beforeEach(() => cy.dangNhap('ceo@commerio.vn', 'ceo'));

  it('chuyển đủ query, callback một shop đang thiết lập mở wizard dù không tạo mới', () => {
    cy.window().then((win) => {
      const bridge = (win as unknown as { __msw: {
        worker: { use: (handler: unknown) => void };
        http: { post: (path: string, fn: (args: { request: Request }) => Promise<Response>) => unknown };
        HttpResponse: { json: (data: unknown) => Response };
      } }).__msw;
      bridge.worker.use(bridge.http.post('*/api/v1/channel/shops/mock/callback', async ({ request }) => {
        expect(await request.json()).to.deep.equal({ state: 's1', params: { code: 'abc', shop_id: '123', main_account_id: '456', extra: 'a+b' } });
        const item = { shop: { id: 'shp-001', status: 'connecting', shopName: 'Shop thử' }, created: false, reconnect: null };
        return bridge.HttpResponse.json({ ...item, shops: [item] });
      }));
    });
    navigateCallback('state=s1&code=abc&shop_id=123&main_account_id=456&extra=a%2Bb');
    cy.location('pathname').should('match', /\/shops\/shp-001\/setup$/);
  });

  it('từ chối uỷ quyền không gọi callback', () => {
    cy.mockApi('post', '/channel/shops/mock/callback', 500, { detail: 'Không được gọi callback' });
    navigateCallback('state=s1&error=access_denied');
    cy.toast('Bạn đã từ chối uỷ quyền, chưa kết nối gian hàng nào.').should('be.visible');
    cy.location('pathname').should('eq', '/c/cmp-001/channel/shops');
  });

  it('nhiều shop về danh sách và báo đúng số lượng', () => {
    const item = { shop: { id: 'shp-001', status: 'connecting', shopName: 'Shop thử' }, created: true, reconnect: null };
    cy.mockApi('post', '/channel/shops/mock/callback', 201, { ...item, shops: [item, { ...item, shop: { ...item.shop, id: 'shp-002' } }] });
    navigateCallback('state=s1&code=abc');
    cy.location('pathname').should('eq', '/c/cmp-001/channel/shops');
    cy.toast('Đã kết nối 2 gian hàng').should('be.visible');
  });

  it('MSW nối hai shop của tài khoản chính và hiện nút thiết lập từng shop', () => {
    cy.menu('Kênh bán');
    cy.findByRole('button', { name: 'Thêm gian hàng' }).click();
    cy.findByRole('button', { name: 'Kết nối Sàn giả lập (mock)' }).click();
    cy.location('pathname').should('eq', '/mock-oauth/authorize');
    cy.location('search').then((search) => {
      const state = new URLSearchParams(search).get('state')!;
      const code = btoa(encodeURIComponent(JSON.stringify({ externalShopId: 'multi-test', shopName: 'Shop tài khoản chính' })));
      navigateCallback(new URLSearchParams({ state, code, main_account_id: 'main-test' }).toString());
    });
    cy.toast('Đã kết nối 2 gian hàng').should('be.visible');
    cy.contains('tbody tr', 'Shop tài khoản chính 2').within(() => {
      cy.contains('Đang thiết lập').should('exist');
      cy.findByRole('button', { name: 'Thiết lập' }).should('exist');
    });
  });

  it('nhãn lấy boolean BE, hạn hiển thị lấy hạn uỷ quyền gần hơn, sàn lạ không trống', () => {
    const base = { companyId: 'cmp-001', platform: 'shopee_v2', externalShopId: 'x', shopName: 'Shop mới', status: 'active', region: null,
      accessExpiresAt: null, refreshExpiresAt: '2099-12-01T00:00:00Z', authExpiresAt: '2099-01-02T00:00:00Z',
      capabilities: { listingReview: false, hideBy: 'deactivate' }, pendingJobs: 0, listingCount: 0, version: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' };
    cy.mockApi('get', '/channel/shops', 200, { items: [
      { ...base, id: 'a', tokenExpiringSoon: true },
      { ...base, id: 'b', tokenExpiringSoon: false, authExpiresAt: '2020-01-01T00:00:00Z' },
    ] });
    cy.menu('Kênh bán');
    cy.dong('a').should('contain', 'shopee_v2').find('[data-testid=shop-expiring]').should('contain', '02/01/2099');
    cy.dong('b').find('[data-testid=shop-expiring]').should('not.exist');
  });

  it('bộ lọc khách hàng có kênh ở trang sau và không mất sau khi lọc', () => {
    cy.window().then((win) => {
      const bridge = (win as unknown as { __msw: {
        worker: { use: (handler: unknown) => void };
        http: { get: (path: string, fn: (args: { request: Request }) => Response) => unknown };
        HttpResponse: { json: (data: unknown) => Response };
      } }).__msw;
      bridge.worker.use(bridge.http.get('*/api/v1/sales/customers', ({ request }) => {
        const query = new URL(request.url).searchParams;
        const second = query.get('page') === '2' || query.get('channel') === 'shopee_v2';
        return bridge.HttpResponse.json({ items: [{ id: second ? 'c2' : 'c1', name: second ? 'Khách sàn mới' : 'Khách tạo tay',
          phone: '', email: '', channels: [second ? 'shopee_v2' : 'manual'], orderCount: 0, totalSpent: 0, lastOrderAt: null,
          createdAt: '2026-01-01' }], total: query.has('channel') ? 1 : 2, page: Number(query.get('page') ?? 1), pageSize: 100 });
      }));
    });
    cy.menu('Khách hàng');
    cy.chon('Kênh', 'shopee_v2');
    cy.contains('tbody', 'Khách sàn mới').should('exist');
    cy.findByRole('combobox', { name: 'Kênh' }).click();
    cy.findByRole('option', { name: 'Tạo tay' }).should('exist');
  });
});
