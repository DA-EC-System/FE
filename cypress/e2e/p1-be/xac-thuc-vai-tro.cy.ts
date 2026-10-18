// P1 với BE thật · Đăng ký, đăng nhập, refresh token, đổi mật khẩu, vai trò (FE#1 AC-13, FE#2, FE#3; commerio-backend#4, #8)
// Không dùng cy.mockApi. Mỗi lần chạy tự đăng ký công ty mới nên chạy lại được trên cùng database.

const RUN = Date.now().toString().slice(-7);
const MAT_KHAU = 'matkhau123';
const UUID = '[0-9a-f-]{36}';

/** Mã số thuế 10 số, khác nhau giữa các công ty trong một lần chạy */
const maSoThue = (n: number) => `03${RUN}${n}`;
const emailCeo = (n: number) => `ceo${n}.${RUN}@commerio.test`;

const dangKyApi = (n: number) =>
  cy
    .request('POST', '/api/v1/identity/register', {
      company: { name: `Công ty E2E ${RUN}-${n}`, taxCode: maSoThue(n) },
      ceo: { fullName: `CEO Thử ${n}`, email: emailCeo(n), password: MAT_KHAU },
      optionalModules: ['report'],
    })
    .its('body.companyId');

const dangNhapTay = (email: string, password: string) => {
  cy.get('input[name=email]').clear().type(email);
  cy.get('input[name=password]').clear().type(password, { log: false });
  cy.findByRole('button', { name: 'Đăng nhập' }).click();
};
const dangNhap = (email: string, password = MAT_KHAU) => {
  cy.visit('/login');
  dangNhapTay(email, password);
  cy.location('pathname').should('match', new RegExp(`^/c/${UUID}`));
};
const loi = (name: string) =>
  cy.get(`[name="${name}"]`).closest('[data-slot="form-item"]').find('[data-slot="form-message"]');
/** Gọi đăng nhập trong trang, trả mã HTTP (không đổi phiên đang mở) */
const thuDangNhap = (email: string, password: string) =>
  cy.window().then((win) =>
    win
      .fetch('/api/v1/identity/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      .then((r) => r.status),
  );
const dongCo = (text: string) => cy.contains('tbody tr[data-row-id]', text);

let congTy1 = '';
before(() => {
  dangKyApi(1).then((id) => (congTy1 = String(id)));
});

describe('P1-BE · Đăng ký, đăng nhập (commerio-backend#4)', () => {
  it('đăng ký qua form thì sang /login điền sẵn email, đăng nhập vào thẳng công ty (FE#2 AC-4, AC-9)', () => {
    cy.visit('/register');
    const values = {
      companyName: `Công ty Form ${RUN}`,
      taxCode: maSoThue(9),
      fullName: 'Nguyễn Văn Form',
      email: `form.${RUN}@commerio.test`,
      password: MAT_KHAU,
      confirmPassword: MAT_KHAU,
    };
    for (const [name, value] of Object.entries(values)) cy.get(`input[name="${name}"]`).type(value);
    cy.findByRole('button', { name: 'Đăng ký' }).click();
    cy.location('pathname').should('eq', '/login');
    cy.contains('Đăng ký công ty thành công');
    cy.get('input[name=email]').should('have.value', values.email);
    cy.get('input[name=password]').type(MAT_KHAU);
    cy.findByRole('button', { name: 'Đăng nhập' }).click();
    cy.location('pathname').should('match', new RegExp(`^/c/${UUID}`));
  });

  it('email đã có tài khoản thì báo tại ô (FE#2 AC-5)', () => {
    cy.visit('/register');
    const values = {
      companyName: 'Công ty Trùng',
      taxCode: maSoThue(8),
      fullName: 'Người Trùng',
      email: emailCeo(1),
      password: MAT_KHAU,
      confirmPassword: MAT_KHAU,
    };
    for (const [name, value] of Object.entries(values)) cy.get(`input[name="${name}"]`).type(value);
    cy.findByRole('button', { name: 'Đăng ký' }).click();
    loi('email').should('have.text', 'Email này đã có tài khoản');
  });

  it('sai mật khẩu hay email không tồn tại cùng một câu (FE#2 AC-8)', () => {
    cy.visit('/login');
    dangNhapTay(emailCeo(1), 'saimatkhau1');
    cy.contains('[role=alert]', 'Email hoặc mật khẩu không đúng');
    dangNhapTay(`khong.co.${RUN}@commerio.test`, MAT_KHAU);
    cy.contains('[role=alert]', 'Email hoặc mật khẩu không đúng');
    cy.location('pathname').should('eq', '/login');
  });

  it('chưa đăng nhập thì về /login, đăng nhập xong quay lại đúng trang (FE#1 AC-1)', () => {
    cy.visit(`/c/${congTy1}/catalog`);
    cy.location('pathname').should('eq', '/login');
    dangNhapTay(emailCeo(1), MAT_KHAU);
    cy.location('pathname').should('eq', `/c/${congTy1}/catalog`);
  });
});

describe('P1-BE · Phiên, cookie, Bearer (FE#1 AC-13)', () => {
  it('gọi /api/v1/identity/*, refresh nằm trong cookie HttpOnly, các API khác gửi Bearer', () => {
    const goi: { url: string; auth?: string }[] = [];
    cy.intercept('/api/v1/**', (req) => {
      goi.push({ url: new URL(req.url).pathname, auth: req.headers.authorization as string | undefined });
    });
    cy.intercept('POST', '/api/v1/identity/login').as('login');
    dangNhap(emailCeo(1));

    cy.wait('@login').then(({ response }) => {
      const body = response?.body as { accessToken: string; refreshToken?: string };
      expect(body.accessToken).to.be.a('string');
      expect(body, 'refresh token không nằm trong body').not.to.have.property('refreshToken');
      // Không giữ token trong localStorage, sessionStorage (FE#1 AC-3)
      cy.window().then((win) => {
        const dump = JSON.stringify({ ...win.localStorage }) + JSON.stringify({ ...win.sessionStorage });
        expect(dump).not.to.contain(body.accessToken);
      });
    });
    cy.getCookie('commerio_refresh').should((c) => {
      expect(c, 'cookie commerio_refresh').to.exist;
      expect(c?.httpOnly).to.eq(true);
      expect(c?.path).to.eq('/api/v1/identity');
      expect(c?.sameSite).to.eq('strict');
    });
    cy.window().then((win) => expect(win.document.cookie).not.to.contain('commerio_refresh'));

    cy.wrap(goi).should((ds) => {
      const xacThuc = ds.filter((g) => /\/(login|register|refresh|logout)$/.test(g.url));
      const conLai = ds.filter((g) => !xacThuc.includes(g));
      expect(xacThuc.length, 'có gọi API xác thực').to.be.greaterThan(0);
      for (const g of xacThuc) expect(g.url).to.match(/^\/api\/v1\/identity\//);
      expect(conLai.length, 'có gọi API cần đăng nhập').to.be.greaterThan(0);
      for (const g of conLai) expect(g.auth, g.url).to.match(/^Bearer \S+/);
    });
  });

  it('F5 thì dùng cookie refresh lấy access token mới, vẫn ở trang đang mở (FE#1 AC-4)', () => {
    dangNhap(emailCeo(1));
    cy.visit(`/c/${congTy1}/catalog`);
    cy.getCookie('commerio_refresh').its('value').as('cuoiCu');
    cy.intercept('POST', '/api/v1/identity/refresh').as('refresh');
    cy.reload();
    cy.wait('@refresh').its('response.statusCode').should('eq', 200);
    cy.location('pathname').should('eq', `/c/${congTy1}/catalog`);
    cy.get('main').should('not.contain', 'không có quyền');
    // Refresh token xoay vòng: cookie mới khác cookie cũ
    cy.get<string>('@cuoiCu').then((cu) => cy.getCookie('commerio_refresh').its('value').should('not.eq', cu));
  });

  it('đăng xuất xoá cookie; Back hay mở lại đều về /login (FE#1 AC-12)', () => {
    dangNhap(emailCeo(1));
    cy.findByRole('button', { name: 'Tài khoản' }).click();
    cy.findByRole('menuitem', { name: 'Đăng xuất' }).click();
    cy.location('pathname').should('eq', '/login');
    cy.getCookie('commerio_refresh').should('not.exist');
    cy.go('back');
    cy.location('pathname').should('not.match', /^\/c\//);
    cy.visit(`/c/${congTy1}/catalog`);
    cy.location('pathname').should('eq', '/login');
  });
});

describe('P1-BE · Đổi mật khẩu (commerio-backend#4)', () => {
  it('mật khẩu hiện tại sai thì báo tại ô; đổi xong mật khẩu cũ hết dùng được (FE#2 AC-14, AC-15)', () => {
    dangKyApi(2);
    dangNhap(emailCeo(2));
    cy.findByRole('button', { name: 'Tài khoản' }).click();
    cy.findByRole('menuitem', { name: 'Đổi mật khẩu' }).click();
    cy.location('pathname').should('eq', '/change-password');
    const doi = (current: string, next: string) => {
      for (const [name, value] of Object.entries({ currentPassword: current, newPassword: next, confirmPassword: next }))
        cy.get(`input[name="${name}"]`).clear().type(value);
      cy.findByRole('button', { name: 'Lưu mật khẩu mới' }).click();
    };
    doi('saimatkhau1', 'matkhau999');
    loi('currentPassword').should('have.text', 'Mật khẩu hiện tại không đúng');
    doi(MAT_KHAU, 'matkhau999');
    cy.contains('Đã đổi mật khẩu. Lần đăng nhập sau dùng mật khẩu mới.');
    cy.findByRole('button', { name: 'Tiếp tục' }).click();
    cy.location('pathname').should('match', new RegExp(`^/c/${UUID}`));
    thuDangNhap(emailCeo(2), MAT_KHAU).should('eq', 401);
    thuDangNhap(emailCeo(2), 'matkhau999').should('eq', 200);
  });
});

describe('P1-BE · Vai trò (commerio-backend#8)', () => {
  it('CEO: vai trò có sẵn chỉ xem; tạo vai trò kiểm tên trùng; xoá vai trò tự tạo (FE#3 AC-8, AC-9)', () => {
    const ten = `Chăm sóc ${RUN}`;
    dangNhap(emailCeo(1));
    cy.menu('Vai trò');
    cy.get('thead').should('contain', 'Số tài khoản');
    cy.get('tbody tr[data-row-id]').filter(':contains("Có sẵn")').should('have.length.at.least', 3);
    dongCo('Sale').findByRole('button', { name: 'Xem tập quyền' }).click();
    cy.findByRole('dialog').within(() => {
      cy.findAllByRole('checkbox').should('have.length.greaterThan', 0).each(($c) => expect($c).to.be.disabled);
      cy.findByRole('button', { name: 'Lưu' }).should('not.exist');
      cy.findByRole('button', { name: 'Đóng' }).click();
    });

    cy.findByRole('button', { name: 'Tạo vai trò' }).click();
    cy.findByRole('dialog').within(() => {
      cy.get('button[role=checkbox][value^="platform."]').should('not.exist');
      cy.get('input[name=name]').type('Sale');
      // Nhãn quyền do BE trả về, khác câu chữ của mock
      cy.contains('label', /^Xem.*sản phẩm/).click();
      cy.findByRole('button', { name: 'Lưu' }).click();
    });
    loi('name').should('not.be.empty');
    cy.get('input[name=name]').clear().type(ten);
    cy.findByRole('dialog').findByRole('button', { name: 'Lưu' }).click();
    cy.toast(`Đã tạo vai trò ${ten}`);
    dongCo(ten).should('exist');

    // Tải lại trang: vai trò vừa tạo vẫn còn, tức đã lưu ở BE
    cy.reload();
    dongCo(ten).findByRole('button', { name: 'Xoá' }).click();
    cy.findByRole('alertdialog').findByRole('button', { name: 'Xoá' }).click();
    cy.toast(`Đã xoá vai trò ${ten}`);
    dongCo(ten).should('not.exist');
  });

  it('API vai trò, quyền: không có Bearer thì 401, có Bearer thì trả được (commerio-backend#8)', () => {
    cy.request({ url: '/api/v1/identity/roles', failOnStatusCode: false }).its('status').should('eq', 401);
    dangNhap(emailCeo(1));
    cy.intercept('GET', '/api/v1/identity/permissions').as('quyen');
    cy.menu('Vai trò');
    cy.findByRole('button', { name: 'Tạo vai trò' }).click();
    cy.wait('@quyen').then(({ request, response }) => {
      expect(request.headers.authorization).to.match(/^Bearer /);
      // 304 khi trình duyệt còn bản cache cùng ETag
      expect(response?.statusCode).to.be.oneOf([200, 304]);
    });
  });
});

export {};
