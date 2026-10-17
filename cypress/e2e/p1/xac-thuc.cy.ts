// P1 · Đăng nhập, phiên và chặn trang (FE#1; commerio-backend#4, #7)

const dangNhapTay = (email: string, password: string) => {
  cy.get('input[name=email]').type(email);
  cy.get('input[name=password]').type(password, { log: false });
  cy.findByRole('button', { name: 'Đăng nhập' }).click();
};
const thanhBen = () => cy.get('[data-sidebar="sidebar"]');

describe('P1 · Xác thực và chặn trang', () => {
  it('chưa đăng nhập thì về /login, đăng nhập xong quay lại đúng trang (AC-1)', () => {
    cy.visit('/c/cmp-001/catalog');
    cy.location('pathname').should('eq', '/login');
    dangNhapTay('sale@commerio.vn', 'sale');
    cy.location('pathname').should('eq', '/c/cmp-001/catalog');
  });

  it('đã đăng nhập mở /login thì về trang chủ của phiên (AC-2)', () => {
    cy.dangNhap('sale@commerio.vn', 'sale');
    cy.visit('/login');
    cy.location('pathname').should('match', /^\/c\/cmp-001/);
  });

  it('không giữ token trong localStorage, sessionStorage (AC-3)', () => {
    cy.dangNhap('sale@commerio.vn', 'sale');
    cy.window().then((win) => {
      const dump = JSON.stringify({ ...win.localStorage }) + JSON.stringify({ ...win.sessionStorage });
      expect(dump).not.to.match(/mock\.acc-|accessToken|refresh/i);
    });
  });

  it('F5 vẫn ở trang đang mở (AC-4)', () => {
    cy.dangNhap('sale@commerio.vn', 'sale');
    cy.visit('/c/cmp-001/pricing');
    cy.reload();
    cy.location('pathname').should('eq', '/c/cmp-001/pricing');
    cy.get('main').should('not.contain', 'không có quyền');
  });

  it('access token hết hạn thì tự làm mới, refresh cũng hết thì về /login (AC-4, AC-5)', () => {
    const ttl = { accessTtlMs: 2000, refreshTtlMs: 6000 };
    cy.visit('/login', {
      onBeforeLoad: (win) => Object.assign(win, { __commerioMock: ttl }),
    });
    dangNhapTay('sale@commerio.vn', 'sale');
    cy.location('pathname').should('match', /^\/c\/cmp-001/);
    // Access 2 giây đã hết, refresh 6 giây còn: bấm menu vẫn mở được trang, không báo lỗi phiên
    cy.wait(2500);
    cy.menu('Sản phẩm');
    cy.location('pathname').should('eq', '/c/cmp-001/catalog');
    cy.get('tbody tr[data-row-id]').should('have.length.greaterThan', 0);
    cy.get('body').should('not.contain', 'hết hạn');
    // Cả refresh cũng hết
    cy.wait(6500);
    cy.menu('Bảng giá');
    cy.location('pathname', { timeout: 10000 }).should('eq', '/login');
  });

  it('khung trang, menu theo quyền; Sale không thấy Vai trò, Phân hệ (AC-6)', () => {
    cy.dangNhap('sale@commerio.vn', 'sale');
    cy.get('header').should('contain', 'Thời trang ABC');
    thanhBen().should('contain', 'Sản phẩm').and('not.contain', 'Vai trò').and('not.contain', 'Phân hệ');
    cy.findByRole('button', { name: 'Tài khoản' }).click();
    cy.findByRole('menuitem', { name: 'Đổi mật khẩu' }).should('exist');
    cy.findByRole('menuitem', { name: 'Đăng xuất' }).should('exist');
  });

  it('Sale mở trang vai trò bằng URL thì báo không có quyền (AC-7)', () => {
    cy.dangNhap('sale@commerio.vn', 'sale');
    cy.visit('/c/cmp-001/admin/roles');
    cy.get('main').should('contain', 'không có quyền');
    cy.get('tbody tr[data-row-id]').should('not.exist');
  });

  it('phân hệ chưa bật thì báo chưa bật (AC-8)', () => {
    cy.dangNhap('ceo@commerio.vn', 'ceo', 'Minh Phát');
    cy.visit('/c/cmp-003/channel/shops');
    cy.get('main').should('contain', 'Phân hệ chưa bật');
  });

  it('quản trị nền tảng vào /platform, không có menu khu công ty (AC-9)', () => {
    cy.visit('/login');
    dangNhapTay('platform@commerio.vn', 'platform');
    cy.location('pathname').should('match', /^\/platform/);
    thanhBen().should('not.contain', 'Sản phẩm').and('not.contain', 'Bảng giá');
  });

  it('nhân viên mở /platform thì bị chặn (AC-9)', () => {
    cy.dangNhap('sale@commerio.vn', 'sale');
    cy.visit('/platform/companies');
    cy.get('body').should('contain', 'chỉ dành cho quản trị nền tảng');
    cy.get('tbody tr[data-row-id]').should('not.exist');
  });

  it('còn mật khẩu thư mời thì luôn bị đưa tới /change-password (AC-10)', () => {
    cy.visit('/login');
    dangNhapTay('moi@commerio.vn', 'moi12345');
    cy.location('pathname').should('eq', '/change-password');
    for (const p of ['/c/cmp-001', '/c/cmp-001/catalog', '/select-company']) {
      cy.visit(p);
      cy.location('pathname').should('eq', '/change-password');
    }
  });

  it('mở công ty không thuộc thì về trang chọn công ty (AC-11)', () => {
    cy.dangNhap('ceo@commerio.vn', 'ceo');
    cy.visit('/c/cmp-002');
    cy.location('pathname').should('eq', '/select-company');
  });

  it('đăng xuất rồi Back hay mở lại cũng không vào được (AC-12)', () => {
    cy.dangNhap('sale@commerio.vn', 'sale');
    cy.findByRole('button', { name: 'Tài khoản' }).click();
    cy.findByRole('menuitem', { name: 'Đăng xuất' }).click();
    cy.location('pathname').should('eq', '/login');
    cy.go('back');
    cy.location('pathname').should('not.match', /^\/c\//);
    cy.visit('/c/cmp-001/catalog');
    cy.location('pathname').should('eq', '/login');
  });
});

export {};
