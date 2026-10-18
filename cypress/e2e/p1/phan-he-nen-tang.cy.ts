// P1 · Phân hệ, nhật ký thao tác, quản trị nền tảng, phân quyền (FE#3 AC-2, AC-11..AC-16; commerio-backend#8, #10)

const dongCo = (text: string) => cy.contains('tbody tr[data-row-id]', text);
const thanhBen = () => cy.get('[data-sidebar="sidebar"]');
const KHONG_CO_QUYEN = /403|không có quyền/i;

describe('P1 · Phân hệ, nhật ký (CEO)', () => {
  beforeEach(() => cy.dangNhap('ceo@commerio.vn', 'ceo'));

  it('5 thẻ phân hệ; Kênh bán đã có dữ liệu thì không tắt được (AC-11)', () => {
    cy.menu('Phân hệ');
    cy.get('[data-module]').should('have.length', 5);
    cy.get('[data-module="channel"]').within(() => {
      cy.findByRole('button', { name: 'Tắt' }).should('be.disabled');
      cy.findByTestId('has-data-note').should('contain', 'không tắt được');
    });
  });

  it('bật Trợ lý AI phải tích đồng ý; module_state_changed thì báo (AC-12)', () => {
    cy.menu('Phân hệ');
    cy.get('[data-module="assistant"]').findByRole('button', { name: 'Bật' }).click();
    cy.findByRole('dialog').within(() => {
      cy.findByRole('button', { name: 'Đồng ý và bật' }).should('be.disabled');
      cy.findByRole('button', { name: 'Không đồng ý' }).click();
    });
    cy.get('[data-module="assistant"]').should('contain', 'Đang tắt').findByRole('button', { name: 'Bật' }).click();
    cy.findByRole('dialog').within(() => {
      cy.findByRole('checkbox').click();
      cy.findByRole('button', { name: 'Đồng ý và bật' }).click();
    });
    cy.toast('Đã bật Trợ lý AI');
    cy.get('[data-module="assistant"]').should('contain', 'Đang bật');

    cy.mockApi('put', '/platform/modules/:code', 409, {
      status: 409,
      title: 'Conflict',
      code: 'module_state_changed',
      current: { code: 'purchasing', enabled: true, hasData: false, enabledAt: '2026-10-18T00:00:00.000Z', enabledBy: null, aiConsentAt: null, aiConsentBy: null },
    });
    cy.get('[data-module="purchasing"]').findByRole('button', { name: 'Bật' }).click();
    cy.toast('vừa được người khác bật');
  });

  it('nhật ký: lọc theo thao tác, xem trước/sau (AC-13)', () => {
    cy.menu('Nhật ký thao tác');
    cy.get('tbody tr[data-row-id]').should('have.length.greaterThan', 0);
    cy.chon('Thao tác', 'Sửa');
    cy.get('tbody tr[data-row-id]').should(($trs) => {
      expect($trs.length).to.be.greaterThan(0);
      $trs.each((_, tr) => void expect(tr.innerText).to.contain('Sửa'));
    });
    cy.get('tbody tr[data-row-id]').first().click();
    cy.findByTestId('audit-diff').find('tr[data-changed]').should('have.length.greaterThan', 0);
  });
});

describe('P1 · Phân quyền khu quản trị công ty', () => {
  it('Admin: không có Phân hệ, có Nhật ký; mở Phân hệ bằng URL bị chặn (AC-11, AC-13)', () => {
    cy.dangNhap('admin@commerio.vn', 'admin');
    thanhBen().should('contain', 'Nhật ký thao tác').and('not.contain', 'Phân hệ');
    cy.visit('/c/cmp-001/admin/modules');
    cy.get('main').invoke('text').should('match', KHONG_CO_QUYEN);
  });

  it('Sale: xem danh sách nhân viên không có nút thao tác; Phân hệ, Nhật ký bị chặn (AC-2, AC-11, AC-13)', () => {
    cy.dangNhap('sale@commerio.vn', 'sale');
    thanhBen().should('not.contain', 'Phân hệ').and('not.contain', 'Nhật ký thao tác');
    cy.visit('/c/cmp-001/admin/staff');
    cy.findByRole('button', { name: 'Thêm nhân viên' }).should('not.exist');
    cy.get('tbody button').should('not.exist');
    for (const p of ['/c/cmp-001/admin/audit-logs', '/c/cmp-001/admin/modules']) {
      cy.visit(p);
      cy.get('main').invoke('text').should('match', KHONG_CO_QUYEN);
    }
  });
});

describe('P1 · Quản trị nền tảng', () => {
  beforeEach(() => {
    cy.visit('/login');
    cy.get('input[name=email]').type('platform@commerio.vn');
    cy.get('input[name=password]').type('platform', { log: false });
    cy.findByRole('button', { name: 'Đăng nhập' }).click();
    cy.location('pathname').should('match', /^\/platform/);
  });

  it('khoá công ty phải có lý do; mở khoá không hỏi lý do (AC-14)', () => {
    cy.menu('Công ty');
    cy.get('thead').invoke('text').should('not.match', /doanh thu|đơn hàng|sản phẩm/i);
    dongCo('Đồ chơi').findByRole('button', { name: 'Khoá' }).click();
    cy.findByRole('dialog').findByRole('button', { name: 'Khoá công ty' }).click();
    cy.get('textarea[name=reason]').closest('[data-slot="form-item"]').find('[data-slot="form-message"]')
      .should('have.text', 'Cần nhập lý do khoá');
    cy.get('textarea[name=reason]').type('Kiểm thử khoá');
    cy.findByRole('dialog').findByRole('button', { name: 'Khoá công ty' }).click();
    cy.toast('Đã khoá');
    dongCo('Đồ chơi').should('contain', 'Đã khoá');

    dongCo('Nông sản').findByRole('button', { name: 'Mở khoá' }).click();
    cy.findByRole('alertdialog').within(() => {
      cy.get('textarea').should('not.exist');
      cy.findByRole('button', { name: 'Mở khoá' }).click();
    });
    cy.toast('Đã mở khoá');

    cy.menu('Nhật ký nền tảng');
    cy.get('tbody tr[data-row-id]').should('have.length.greaterThan', 0);
  });

  it('version_conflict thì báo trạng thái mới; 404 thì "Không tìm thấy" (AC-16)', () => {
    cy.menu('Công ty');
    cy.mockApi('post', '/platform/companies/:id/lock', 409, {
      status: 409,
      title: 'Conflict',
      code: 'version_conflict',
      current: { id: 'cmp-002', name: 'Công ty TNHH Mỹ phẩm XYZ', status: 'locked', lockReason: 'Khoá ở phiên khác', version: 7 },
    });
    dongCo('Mỹ phẩm XYZ').findByRole('button', { name: 'Khoá' }).click();
    cy.get('textarea[name=reason]').type('Thử xung đột');
    cy.findByRole('dialog').findByRole('button', { name: 'Khoá công ty' }).click();
    cy.toast('vừa được người khác đổi').should('contain', 'đã khoá');

    cy.mockApi('post', '/platform/companies/:id/unlock', 404, { status: 404, title: 'Không tìm thấy', code: 'not_found' });
    dongCo('Nông sản').findByRole('button', { name: 'Mở khoá' }).click();
    cy.findByRole('alertdialog').findByRole('button', { name: 'Mở khoá' }).click();
    cy.toast('Không tìm thấy');
  });

  it('quản trị nền tảng mở trang công ty thì bị chặn, không lộ dữ liệu (AC-15)', () => {
    cy.visit('/c/cmp-001/admin/staff');
    cy.get('body').invoke('text').should('match', KHONG_CO_QUYEN);
    cy.get('body').should('not.contain', 'ceo@commerio.vn');
  });
});

export {};
