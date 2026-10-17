// P1 · Nhân viên, vai trò (FE#3 AC-1..AC-10; commerio-backend#8)

const dongCo = (text: string) => cy.contains('tbody tr[data-row-id]', text);
const loi = (name: string) =>
  cy.get(`[name="${name}"]`).closest('[data-slot="form-item"]').find('[data-slot="form-message"]');
const vaiTro = (name: string) => cy.findByTestId('role-checklist').contains('label', name).click();
const guiMoi = () => cy.findByRole('dialog').findByRole('button', { name: 'Lưu và gửi thư mời' }).click();
const moFormMoi = (email: string, fullName: string, role?: string) => {
  cy.findByRole('button', { name: 'Thêm nhân viên' }).click();
  cy.get('input[name=email]').type(email);
  cy.get('input[name=fullName]').type(fullName);
  if (role) vaiTro(role);
};

describe('P1 · Nhân viên (CEO)', () => {
  beforeEach(() => {
    cy.dangNhap('ceo@commerio.vn', 'ceo');
    cy.menu('Nhân viên');
    cy.get('tbody tr[data-row-id]').should('have.length.greaterThan', 1);
  });

  it('danh sách: CEO đứng đầu, tìm, lọc trạng thái và vai trò (AC-1)', () => {
    cy.get('thead').should('contain', 'Họ tên').and('contain', 'Email').and('contain', 'Vai trò').and('contain', 'Trạng thái');
    cy.get('tbody tr[data-row-id]').first().should('contain', 'Lê Hoàng Minh').and('contain', 'CEO');
    cy.findByTestId('page-range').invoke('text').should('match', /\d+–\d+ \/ \d+/);
    cy.findByRole('searchbox').type('kho');
    cy.get('tbody tr[data-row-id]').should('have.length', 1).and('contain', 'Ngô Văn Kho');
    cy.findByRole('searchbox').clear();
    cy.chon('Trạng thái', 'Tạm khoá');
    cy.get('tbody tr[data-row-id]').should('have.length', 1).and('contain', 'Hồ Đã Nghỉ');
    cy.chon('Trạng thái', 'Tất cả');
    cy.chon('Vai trò', 'Sale');
    cy.get('tbody tr[data-row-id]').should(($trs) => {
      expect($trs.length).to.be.at.least(2);
      $trs.each((_, tr) => void expect(tr.innerText).to.contain('Sale'));
    });
  });

  it('dòng CEO (chính mình) khoá nút, dòng khác bấm được (AC-2)', () => {
    cy.get('tbody tr[data-row-id]').first().find('button').should('have.length', 2).each(($b) => expect($b).to.be.disabled);
    dongCo('Trần Thị Bán Hàng').find('button').first().should('be.enabled');
  });

  it('bỏ trống báo tại ô; lỗi 422 gắn vào ô (AC-3); không có CEO trong danh sách vai trò (AC-6)', () => {
    cy.findByRole('button', { name: 'Thêm nhân viên' }).click();
    cy.findByTestId('role-checklist').contains('label', /^CEO$/).should('not.exist');
    guiMoi();
    loi('email').should('not.be.empty');
    loi('fullName').should('not.be.empty');
    cy.findByTestId('role-checklist').closest('[data-slot="form-item"]').find('[data-slot="form-message"]').should('not.be.empty');

    cy.get('input[name=email]').type('loi.422@congty.vn');
    cy.get('input[name=fullName]').type('Người Lỗi');
    vaiTro('Sale');
    cy.mockApi('post', '/identity/staff', 422, {
      status: 422,
      title: 'Dữ liệu không hợp lệ',
      code: 'validation_failed',
      errors: { email: 'Email này BE không nhận' },
    });
    guiMoi();
    loi('email').should('have.text', 'Email này BE không nhận');
  });

  it('mời tài khoản mới (invited) và tài khoản đã có ở công ty khác (added) (AC-4)', () => {
    moFormMoi('nv.moi@congty.vn', 'Phan Nhân Viên Mới', 'Sale');
    guiMoi();
    cy.toast('Đã tạo tài khoản và gửi thư mời tới nv.moi@congty.vn');
    dongCo('nv.moi@congty.vn').should('exist');

    moFormMoi('da.co@congtykhac.vn', 'Đã Có Tài Khoản', 'Sale');
    cy.mockApi('post', '/identity/staff', 201, {
      outcome: 'added',
      member: {
        accountId: 'acc-x',
        email: 'da.co@congtykhac.vn',
        fullName: 'Đã Có Tài Khoản',
        roles: [{ id: 'role-sale', name: 'Sale' }],
        status: 'active',
        isCeo: false,
        pendingFirstLogin: false,
        joinedAt: '2026-10-18T00:00:00.000Z',
        version: 1,
      },
    });
    guiMoi();
    cy.toast(/Đã thêm .* vào công ty/).should('not.contain', 'mật khẩu');
  });

  it('email đã là thành viên thì hỏi thêm vai trò; CEO thì chặn (AC-5)', () => {
    moFormMoi('sale@commerio.vn', 'Trần Thị Bán Hàng', 'Nhân viên kho');
    guiMoi();
    cy.findByTestId('already-member').should('contain', 'sale@commerio.vn').and('contain', 'Sale');
    cy.findByRole('dialog').findByRole('button', { name: 'Không' }).click();
    cy.get('input[name=email]').should('have.value', 'sale@commerio.vn');
    guiMoi();
    cy.findByRole('dialog').findByRole('button', { name: 'Thêm vai trò' }).click();
    cy.toast('Đã thêm vai trò');
    dongCo('sale@commerio.vn').should('contain', 'Nhân viên kho').and('contain', 'Sale');

    moFormMoi('ceo@commerio.vn', 'Lê Hoàng Minh', 'Sale');
    guiMoi();
    cy.findByTestId('already-member').should('contain', 'không đổi được vai trò');
    cy.findByRole('dialog').findByRole('button', { name: 'Thêm vai trò' }).should('not.exist');
  });

  it('permission_not_held, protected_account hiện câu tiếng Việt khác nhau (AC-6)', () => {
    dongCo('kho@commerio.vn').findByRole('button', { name: 'Đổi vai trò' }).click();
    const thongBao = () => cy.findByRole('dialog').find('[role=alert],[role=status]').first();
    cy.mockApi('put', '/identity/staff/:id/roles', 403, { status: 403, title: 'Forbidden', code: 'permission_not_held' });
    cy.findByRole('dialog').findByRole('button', { name: 'Lưu' }).click();
    thongBao().invoke('text').should('match', /[À-ỹ]/).and('not.contain', 'permission_not_held').as('m1');
    cy.mockApi('put', '/identity/staff/:id/roles', 403, { status: 403, title: 'Forbidden', code: 'protected_account' });
    cy.findByRole('dialog').findByRole('button', { name: 'Lưu' }).click();
    cy.get<string>('@m1').then((m1) => thongBao().invoke('text').should('not.eq', m1).and('match', /[À-ỹ]/));
  });

  it('khoá có xác nhận; mở khoá gặp version_conflict thì báo trạng thái mới (AC-7)', () => {
    dongCo('Đỗ Mới Vào').findByRole('button', { name: 'Tạm khoá' }).click();
    cy.findByRole('alertdialog').should('contain', 'Đỗ Mới Vào').findByRole('button', { name: 'Tạm khoá' }).click();
    cy.toast('Đã tạm khoá Đỗ Mới Vào');
    dongCo('Đỗ Mới Vào').should('contain', 'Tạm khoá');

    cy.mockApi('post', '/identity/staff/:id/unlock', 409, {
      status: 409,
      title: 'Conflict',
      code: 'version_conflict',
      current: {
        accountId: 'acc-006',
        email: 'nghi@commerio.vn',
        fullName: 'Hồ Đã Nghỉ',
        roles: [],
        status: 'active',
        isCeo: false,
        joinedAt: '2026-02-01T08:00:00.000Z',
        version: 9,
      },
    });
    dongCo('Hồ Đã Nghỉ').findByRole('button', { name: 'Mở khoá' }).click();
    cy.findByRole('alertdialog').findByRole('button', { name: 'Mở khoá' }).click();
    cy.toast('vừa được người khác sửa').should('contain', 'hoạt động');
  });
});

describe('P1 · Vai trò', () => {
  it('CEO: vai trò có sẵn chỉ xem; tạo vai trò kiểm tên trùng; xoá vai trò còn người dùng (AC-8..AC-10)', () => {
    cy.dangNhap('ceo@commerio.vn', 'ceo');
    cy.menu('Vai trò');
    cy.get('thead').should('contain', 'Số tài khoản');
    cy.get('tbody tr[data-row-id]').filter(':contains("Có sẵn")').should('have.length', 3);
    dongCo('Sale').findByRole('button', { name: 'Xem tập quyền' }).click();
    cy.findByRole('dialog').within(() => {
      cy.findAllByRole('checkbox').each(($c) => expect($c).to.be.disabled);
      cy.findByRole('button', { name: 'Lưu' }).should('not.exist');
      cy.findByRole('button', { name: 'Đóng' }).click();
    });

    cy.findByRole('button', { name: 'Tạo vai trò' }).click();
    cy.findByRole('dialog').within(() => {
      cy.get('fieldset legend').should('have.length.at.least', 3);
      cy.get('button[role=checkbox][value^="platform."]').should('not.exist');
      cy.findByRole('button', { name: 'Lưu' }).click();
      cy.get('[data-slot="form-message"]').should('have.length.at.least', 2);
      cy.get('input[name=name]').type('Sale');
      cy.contains('label', 'Xem sản phẩm').click();
      cy.findByRole('button', { name: 'Lưu' }).click();
    });
    loi('name').should('not.be.empty');
    cy.get('input[name=name]').clear().type('Chăm sóc khách 2');
    cy.findByRole('dialog').findByRole('button', { name: 'Lưu' }).click();
    cy.toast('Đã tạo vai trò Chăm sóc khách 2');
    dongCo('Chăm sóc khách 2').should('exist');

    dongCo('Chăm sóc khách hàng').findByRole('button', { name: 'Xoá' }).click();
    cy.findByRole('alertdialog').findByRole('button', { name: 'Xoá' }).click();
    cy.toast('còn tài khoản');
    dongCo('Chăm sóc khách hàng').should('exist');
  });

  it('Admin: vai trò có quyền mình không có thì chỉ xem (AC-10)', () => {
    cy.dangNhap('admin@commerio.vn', 'admin');
    cy.menu('Vai trò');
    dongCo('Nhân viên kho').within(() => {
      cy.findByRole('button', { name: 'Xem tập quyền' }).should('exist');
      cy.findByRole('button', { name: 'Xoá' }).should('not.exist');
    });
    dongCo('Nhân viên kho').findByRole('button', { name: 'Xem tập quyền' }).click();
    cy.findByRole('dialog').invoke('text').should('match', /có sẵn|quyền bạn không có/);
  });
});

export {};
