// P1 · Đăng ký công ty, đăng nhập, chọn công ty, đổi mật khẩu (FE#2; commerio-backend#4, #7)

/** Dòng lỗi dưới ô có `name` */
const loi = (name: string) =>
  cy.get(`[name="${name}"]`).closest('[data-slot="form-item"]').find('[data-slot="form-message"]');
const dien = (values: Record<string, string>) => {
  for (const [name, value] of Object.entries(values)) cy.get(`input[name="${name}"]`).clear().type(value);
};
const oPhanHe = (label: string) => cy.contains('form label', label).find('[role=checkbox]');
const dangKy = () => cy.findByRole('button', { name: 'Đăng ký' }).click();
const dangNhapTay = (email: string, password: string) => {
  cy.get('input[name=email]').clear().type(email);
  cy.get('input[name=password]').clear().type(password, { log: false });
  cy.findByRole('button', { name: 'Đăng nhập' }).click();
};

const HOP_LE = {
  companyName: 'Công ty Thử',
  taxCode: '0312999888',
  fullName: 'Nguyễn Văn A',
  email: 'moi.dangky@congtythu.vn',
  password: 'matkhau123',
  confirmPassword: 'matkhau123',
};

describe('P1 · Đăng ký công ty', () => {
  beforeEach(() => {
    cy.visit('/register');
    cy.get('input[name=companyName]').should('exist');
  });

  it('form đủ ô, 5 phân hệ tuỳ chọn (AC-1)', () => {
    for (const f of Object.keys(HOP_LE)) cy.get(`input[name=${f}]`).should('have.length', 1);
    cy.get('form label [role=checkbox]').should('have.length', 5);
    cy.contains('Mười phân hệ lõi');
  });

  it('kiểm dữ liệu tại ô, không gửi lên BE (AC-2)', () => {
    dien({ ...HOP_LE, taxCode: '12345', email: 'abc@', password: 'abcdefgh', confirmPassword: 'abcdefgx' });
    dangKy();
    loi('taxCode').should('contain', 'Mã số thuế');
    loi('email').should('have.text', 'Email không hợp lệ');
    loi('password').should('contain', 'chữ số');
    loi('confirmPassword').should('contain', 'không khớp');
    dien({ password: '1234567' });
    dangKy();
    loi('password').should('contain', '8 ký tự');
    cy.location('pathname').should('eq', '/register');
  });

  it('tích Trợ lý AI thì hỏi đồng ý gửi dữ liệu cho OpenAI (AC-3)', () => {
    dien(HOP_LE);
    oPhanHe('Trợ lý AI').click();
    cy.findByRole('alertdialog').should('contain', 'OpenAI').findByRole('button', { name: 'Không đồng ý' }).click();
    cy.findByRole('alertdialog').should('not.exist');
    oPhanHe('Trợ lý AI').should('have.attr', 'data-state', 'unchecked');
    cy.get('input[name=companyName]').should('have.value', HOP_LE.companyName);
    oPhanHe('Trợ lý AI').click();
    cy.findByRole('alertdialog').findByRole('button', { name: 'Đồng ý' }).click();
    oPhanHe('Trợ lý AI').should('have.attr', 'data-state', 'checked');
  });

  it('đăng ký thành công thì sang /login, điền sẵn email, đăng nhập được (AC-4)', () => {
    dien(HOP_LE);
    oPhanHe('Báo cáo').click();
    dangKy();
    cy.findByRole('button', { name: 'Đang đăng ký...' }).should('be.disabled');
    cy.location('pathname').should('eq', '/login');
    cy.contains('Đăng ký công ty thành công');
    cy.get('input[name=email]').should('have.value', HOP_LE.email);
    cy.get('input[name=password]').type(HOP_LE.password);
    cy.findByRole('button', { name: 'Đăng nhập' }).click();
    cy.location('pathname').should('match', /^\/c\//);
  });

  it('email đã có tài khoản thì báo tại ô (AC-5)', () => {
    dien({ ...HOP_LE, email: 'ceo@commerio.vn' });
    dangKy();
    loi('email').should('have.text', 'Email này đã có tài khoản');
  });

  it('lỗi BE theo khoá ceo.*, company.* gắn đúng ô (AC-6)', () => {
    dien(HOP_LE);
    cy.mockApi('post', '/identity/register', 422, {
      status: 422,
      title: 'Dữ liệu gửi lên không hợp lệ',
      code: 'validation_failed',
      errors: {
        'company.name': 'Tên công ty đã bị cấm',
        'ceo.fullName': 'Họ tên quá ngắn',
        'company.address': 'Thiếu địa chỉ',
      },
    });
    dangKy();
    loi('companyName').should('have.text', 'Tên công ty đã bị cấm');
    loi('fullName').should('have.text', 'Họ tên quá ngắn');
    // Lỗi không gắn được vào ô nào thì hiện ở đầu form
    cy.contains('[role=alert]', 'Thiếu địa chỉ');
  });
});

describe('P1 · Đăng nhập, chọn công ty', () => {
  beforeEach(() => cy.visit('/login'));

  it('trang đăng nhập có Google, Đăng ký công ty, không có Quên mật khẩu (AC-7)', () => {
    cy.findByRole('button', { name: 'Đăng nhập bằng Google' }).should('be.visible');
    cy.findByRole('link', { name: 'Đăng ký công ty' }).should('be.visible');
    cy.contains(/quên mật khẩu/i).should('not.exist');
  });

  it('sai mật khẩu hay email không tồn tại cùng một câu (AC-8, AC-16)', () => {
    dangNhapTay('sale@commerio.vn', 'sai-mat-khau');
    cy.contains('[role=alert]', 'Email hoặc mật khẩu không đúng');
    dangNhapTay('khong-ton-tai@commerio.vn', 'sale');
    cy.contains('[role=alert]', 'Email hoặc mật khẩu không đúng');
    cy.location('pathname').should('eq', '/login');
  });

  it('một công ty thì vào thẳng (AC-9)', () => {
    dangNhapTay('sale@commerio.vn', 'sale');
    cy.location('pathname').should('match', /^\/c\/cmp-001/);
  });

  it('nhiều công ty: công ty hay tài khoản bị khoá hiện mờ có lý do (AC-10)', () => {
    dangNhapTay('kho@commerio.vn', 'kho');
    cy.location('pathname').should('eq', '/select-company');
    cy.contains('button', 'Thời trang ABC').should('be.enabled');
    cy.contains('button', 'Nông sản Sạch').should('be.disabled').and('contain', 'Công ty đang bị khoá');
    cy.contains('button', 'Mỹ phẩm XYZ').should('be.disabled').and('contain', 'Tài khoản của bạn bị khoá');
  });

  for (const [code, msg] of [
    ['company_locked', 'Công ty đang bị khoá'],
    ['account_locked', 'Tài khoản của bạn đang bị khoá trong công ty này'],
  ]) {
    it(`chọn công ty vừa bị khoá (${code}) thì báo, không tải lại (AC-11, AC-16)`, () => {
      dangNhapTay('ceo@commerio.vn', 'ceo');
      cy.contains('button', 'Minh Phát').should('be.enabled');
      cy.mockApi('post', '/identity/select-company', 403, { status: 403, title: 'Bị từ chối', code });
      cy.contains('button', 'Minh Phát').click();
      // Trang công ty báo lý do và cho quay lại chọn công ty khác, không vào được dữ liệu
      cy.contains(msg);
      cy.get('[data-sidebar="sidebar"]').should('not.exist');
      cy.findByRole('link', { name: 'Chọn công ty khác' }).click();
      cy.location('pathname').should('eq', '/select-company');
    });
  }

  it('Google: email chưa có thì báo; đã có thì vào như đăng nhập mật khẩu (AC-12)', () => {
    const google = (email: string) => {
      cy.findByRole('button', { name: 'Đăng nhập bằng Google' }).click();
      cy.get('#google-email').clear().type(email);
      cy.findByRole('button', { name: 'Tiếp tục' }).click();
    };
    google('chua-co@gmail.com');
    cy.contains('[role=alert]', 'chưa có tài khoản');
    cy.location('pathname').should('eq', '/login');
    google('sale@commerio.vn');
    cy.location('pathname').should('match', /^\/c\/cmp-001/);
  });
});

describe('P1 · Đổi mật khẩu thư mời', () => {
  const doi = (current: string, next: string, confirm: string) => {
    dien({ currentPassword: current, newPassword: next, confirmPassword: confirm });
    cy.findByRole('button', { name: 'Lưu mật khẩu mới' }).click();
  };

  beforeEach(() => {
    cy.visit('/login');
    dangNhapTay('moi@commerio.vn', 'moi12345');
    cy.location('pathname').should('eq', '/change-password');
  });

  it('kiểm mật khẩu mới, mật khẩu hiện tại sai (AC-13, AC-14)', () => {
    doi('moi12345', 'moi12345', 'moi12345');
    loi('newPassword').should('contain', 'khác mật khẩu hiện tại');
    doi('moi12345', 'abcdefgh', 'abcdefgh');
    loi('newPassword').should('contain', 'chữ số');
    doi('moi12345', 'matkhau999', 'matkhau998');
    loi('confirmPassword').should('contain', 'không khớp');
    doi('sai12345', 'matkhau999', 'matkhau999');
    loi('currentPassword').should('have.text', 'Mật khẩu hiện tại không đúng');
  });

  it('đổi xong thì mở được trang khác; mật khẩu mới dùng được, mật khẩu cũ thì không (AC-15)', () => {
    doi('moi12345', 'matkhau999', 'matkhau999');
    cy.contains('Đã đổi mật khẩu. Lần đăng nhập sau dùng mật khẩu mới.');
    cy.findByRole('button', { name: 'Tiếp tục' }).click();
    cy.location('pathname').should('not.eq', '/change-password');


    // Đăng xuất tải lại trang làm mock mất dữ liệu, nên gọi thẳng API đăng nhập ngay trong trang
    const thuDangNhap = (password: string) =>
      cy.window().then((win) =>
        win
          .fetch('/api/v1/identity/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'moi@commerio.vn', password }),
          })
          .then((r) => r.status),
      );
    thuDangNhap('moi12345').should('eq', 401);
    thuDangNhap('matkhau999').should('eq', 200);
  });
});

export {};
