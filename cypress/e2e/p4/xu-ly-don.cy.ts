// P4 · Xử lý đơn: huỷ đơn, lô nhặt, xuất kho, cập nhật giao (UC-SF-06 đến UC-SF-09; FE#10)

const CHAN_QUYEN = 'Vai trò của bạn trong công ty này không có quyền mở trang này.';

const khung = () => cy.get('[data-testid=payment-panel]');
const lichSu = () => cy.get('[data-testid=status-history] li').first();
// Hộp xác nhận (ConfirmDialog) là alertdialog, hộp nhập liệu là dialog
const menuThanhBen = (label: string) => cy.contains('[data-sidebar="menu-button"]', new RegExp(`^\\s*${label}\\s*$`));

describe('P4 · Xử lý đơn', () => {
  context('huỷ đơn (UC-SF-06)', () => {
    beforeEach(() => cy.dangNhap('sale@commerio.vn', 'sale'));

    it('huỷ đơn có mã thanh toán đang hiệu lực', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1003');
      khung().findByRole('button', { name: 'Tạo mã thanh toán' }).click();
      cy.findByRole('dialog').within(() => {
        cy.findByLabelText('VietQR').click();
        cy.findByRole('button', { name: 'Tạo mã' }).click();
      });
      cy.get('[data-testid=active-link]').should('exist');

      cy.findByRole('button', { name: 'Huỷ đơn' }).click();
      cy.findByRole('dialog').within(() => {
        cy.contains('Mã thanh toán còn hiệu lực (nếu có) bị huỷ.');
        cy.findByLabelText('Lý do huỷ').type('Khách đổi ý');
        cy.findByRole('button', { name: 'Huỷ đơn' }).click();
      });
      cy.toast('Đã huỷ đơn DH-1003');
      cy.findByRole('dialog').should('not.exist');
      cy.contains('Lý do huỷ').parent().should('contain', 'Khách đổi ý');
      lichSu().should('contain', 'Đã huỷ').and('contain', 'Lý do: Khách đổi ý');
      cy.get('[data-testid=active-link]').should('not.exist');
      khung().contains('Lịch sử mã').click();
      cy.get('[data-testid=link-history]').should('contain', 'Đã huỷ');
      cy.findByRole('button', { name: 'Huỷ đơn' }).should('not.exist');
    });

    it('đơn đã thanh toán sau khi huỷ thì chờ hoàn tiền', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1006');
      cy.findByRole('button', { name: 'Huỷ đơn' }).click();
      cy.findByLabelText('Lý do huỷ').type('Hết hàng');
      cy.findByRole('dialog').findByRole('button', { name: 'Huỷ đơn' }).click();
      cy.toast('Đã huỷ đơn DH-1006');
      khung().should('contain', 'Chờ hoàn tiền');
    });

    it('bỏ trống lý do thì báo lỗi, không gọi API', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1003');
      cy.findByRole('button', { name: 'Huỷ đơn' }).click();
      cy.findByRole('dialog').within(() => {
        cy.findByRole('button', { name: 'Huỷ đơn' }).click();
        cy.contains('Nhập lý do huỷ');
      });
      cy.findByRole('dialog').should('exist');
      cy.contains('Chờ xác nhận');
    });

    it('BE báo đơn đã đổi trạng thái thì đóng hộp thoại và tải lại', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1013');
      cy.findByRole('button', { name: 'Huỷ đơn' }).should('exist');
      cy.mockApi('post', '/sales/orders/ord-1013/cancel', 409, { status: 409, code: 'invalid_transition' });
      cy.findByRole('button', { name: 'Huỷ đơn' }).click();
      cy.findByLabelText('Lý do huỷ').type('Khách đổi ý');
      cy.findByRole('dialog').findByRole('button', { name: 'Huỷ đơn' }).click();
      cy.findByRole('dialog').should('not.exist');
      cy.contains('Đơn vừa được người khác cập nhật');
    });

    it('đơn sàn không có nút huỷ, có ghi chú', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1015');
      cy.contains('Huỷ đơn sàn trên sàn.');
      cy.findByRole('button', { name: 'Huỷ đơn' }).should('not.exist');
    });
  });

  context('lô nhặt và xuất kho (UC-SF-07, UC-SF-08)', () => {
    beforeEach(() => {
      cy.dangNhap('kho@commerio.vn', 'kho');
      cy.menu('Xử lý đơn');
      cy.dong('ord-1006').should('exist');
    });

    it('tạo lô ba đơn, nhặt xong, xuất cả lô có một đơn chưa trả tiền', () => {
      cy.findByRole('tab', { name: /Chờ nhặt/ }).should('contain', '4');
      cy.get('thead').should('not.contain', 'Tổng');
      cy.findByRole('button', { name: /Tạo lô nhặt/ }).should('be.disabled');
      for (const id of ['ord-1006', 'ord-1007', 'ord-1008']) cy.dong(id).find('[role=checkbox]').click();
      cy.findByRole('button', { name: 'Tạo lô nhặt (3)' }).click();
      cy.findByRole('alertdialog').within(() => {
        cy.contains('Gom 3 đơn');
        cy.findByRole('button', { name: 'Tạo lô' }).click();
      });
      cy.toast('Đã tạo lô LO-000004');
      cy.contains('h1', 'Lô LO-000004');
      cy.get('[data-testid=batch-status]').should('contain', 'Đang nhặt');
      cy.get('[data-testid=batch-orders] tbody tr[data-row-id]').should('have.length', 3);

      cy.findByRole('button', { name: 'Nhặt xong' }).click();
      cy.findByRole('alertdialog').findByRole('button', { name: 'Nhặt xong' }).click();
      cy.toast('Đã chuyển 3 đơn sang đóng gói');
      cy.get('[data-testid=batch-status]').should('contain', 'Đã nhặt');
      cy.findByRole('button', { name: 'Nhặt xong' }).should('not.exist');

      cy.findByRole('button', { name: 'Xuất kho cả lô' }).click();
      cy.findByRole('alertdialog').within(() => {
        cy.contains('Sẽ xuất 2 đơn. 1 đơn bị chặn vì chưa thanh toán.');
        cy.findByRole('button', { name: 'Xuất kho' }).click();
      });
      cy.toast('Đã xuất 2 đơn');
      cy.get('[data-testid=issue-failed]').should('contain', 'DH-1007: Chưa thanh toán');
      cy.get('[data-testid=batch-status]').should('contain', 'Đã nhặt');
      cy.get('[data-testid=batch-orders] tr[data-row-id=ord-1007]').within(() => {
        cy.findByRole('button', { name: 'Xuất kho' }).should('be.disabled');
        cy.contains('Chờ khách thanh toán');
      });
    });

    it('danh sách nhặt gộp theo biến thể, mở rộng đơn thấy dòng hàng và lịch sử', () => {
      cy.findByRole('tab', { name: /Đang nhặt/ }).click();
      cy.location('search').should('contain', 'status=picking');
      cy.dong('ord-1010').contains('LO-000001').click();
      cy.contains('h1', 'Lô LO-000001');
      cy.get('[data-testid=pick-list] tbody tr').first().should('contain', '4').and('contain', '3');
      cy.findByRole('button', { name: 'Mở rộng DH-1011' }).click();
      cy.get('[data-testid=batch-order-ord-1011]').within(() => {
        cy.contains('× 2');
        cy.get('[data-testid=status-history]').should('contain', 'Đang lấy hàng');
      });
      cy.findByRole('button', { name: 'In danh sách nhặt' }).should('exist');
    });

    it('tạo lô khi BE báo có đơn đã vào lô khác', () => {
      cy.dong('ord-1006').find('[role=checkbox]').click();
      cy.dong('ord-1008').find('[role=checkbox]').click();
      cy.mockApi('post', '/fulfillment/batches', 409, {
        status: 409,
        code: 'already_in_batch',
        orderIds: ['ord-1008'],
      });
      cy.findByRole('button', { name: 'Tạo lô nhặt (2)' }).click();
      cy.findByRole('alertdialog').findByRole('button', { name: 'Tạo lô' }).click();
      cy.contains('Có đơn vừa thay đổi, chưa tạo lô');
      cy.dong('ord-1008').should('contain', 'Đã thay đổi');
      cy.location('pathname').should('eq', '/c/cmp-001/fulfillment/orders');
      cy.findByRole('button', { name: 'Tạo lô nhặt (1)' }).should('exist');
    });

    it('xuất một đơn ở tab đóng gói; đơn trả trước chưa trả thì khoá', () => {
      cy.findByRole('tab', { name: /Đóng gói/ }).click();
      cy.dong('ord-1014').within(() => {
        cy.findByRole('button', { name: 'Xuất kho' }).should('be.disabled');
        cy.contains('Chờ khách thanh toán');
      });
      cy.dong('ord-1015').findByRole('button', { name: 'Xuất kho' }).click();
      cy.findByRole('alertdialog').findByRole('button', { name: 'Xuất kho' }).click();
      cy.toast(/Đã xuất kho đơn DH-1015, phiếu PX-/);
      cy.dong('ord-1015').should('not.exist');
      cy.contains('[data-sonner-toast] button', 'Xem phiếu').click();
      cy.location('pathname').should('match', /\/inventory\/documents\//);
    });

    it('danh sách lô lọc theo trạng thái, lô không có thì báo không tìm thấy', () => {
      cy.menu('Lô nhặt hàng');
      cy.dong('bat-003').should('exist');
      cy.chon('Trạng thái', 'Đang nhặt');
      cy.dong('bat-001').should('exist');
      cy.dong('bat-003').should('not.exist');
      cy.dong('bat-001').click();
      cy.contains('h1', 'Lô LO-000001');
      cy.visit('/c/cmp-001/fulfillment/batches/bat-999');
      cy.contains('h1', 'Không tìm thấy');
    });
  });

  context('cập nhật giao (UC-SF-09)', () => {
    beforeEach(() => cy.dangNhap('sale@commerio.vn', 'sale'));

    it('đơn đã xuất chuyển sang đang giao', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1016');
      cy.findByRole('button', { name: 'Huỷ đơn' }).should('not.exist');
      cy.findByRole('button', { name: 'Cập nhật giao' }).click();
      cy.findByRole('dialog').within(() => {
        cy.findByLabelText('Đang giao').click();
        cy.findByLabelText('Lý do').should('not.exist');
        cy.findByRole('button', { name: 'Lưu' }).click();
      });
      cy.toast('Đã cập nhật đơn DH-1016: Đang giao');
      lichSu().should('contain', 'Đang giao').and('contain', 'Trần Thị Bán Hàng');
    });

    it('giao không thành công đơn COD: bắt lý do, không thu, vào nhập hoàn', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1017');
      cy.findByRole('button', { name: 'Cập nhật giao' }).click();
      cy.findByRole('dialog').within(() => {
        cy.findByLabelText('Đang giao').should('not.exist');
        cy.findByLabelText('Giao không thành công').click();
        cy.findByRole('button', { name: 'Lưu' }).click();
        cy.contains('Nhập lý do giao không thành công');
        cy.findByLabelText('Lý do').type('Khách không nghe máy');
        cy.findByRole('button', { name: 'Lưu' }).click();
      });
      cy.toast('Đã cập nhật đơn DH-1017: Giao không thành công');
      lichSu().should('contain', 'Giao không thành công').and('contain', 'Lý do: Khách không nghe máy');
      khung().should('contain', 'Không thu');
      cy.findByRole('button', { name: 'Cập nhật giao' }).should('not.exist');
    });

    it('đơn sàn đang giao không có nút cập nhật', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1002');
      cy.findByRole('button', { name: 'Cập nhật giao' }).should('not.exist');
      lichSu().should('contain', 'Sàn');
    });
  });

  context('phân quyền (AC-R1)', () => {
    it('kho thấy Giao vận, không thấy Đơn hàng', () => {
      cy.dangNhap('kho@commerio.vn', 'kho');
      menuThanhBen('Xử lý đơn').should('exist');
      menuThanhBen('Lô nhặt hàng').should('exist');
      menuThanhBen('Đơn hàng').should('not.exist');
    });

    for (const [email, password] of [
      ['sale@commerio.vn', 'sale'],
      ['admin@commerio.vn', 'admin'],
    ]) {
      it(`${password} không thấy Giao vận, mở URL thì bị chặn`, () => {
        cy.dangNhap(email, password);
        menuThanhBen('Xử lý đơn').should('not.exist');
        menuThanhBen('Lô nhặt hàng').should('not.exist');
        cy.visit('/c/cmp-001/fulfillment/orders');
        cy.contains(CHAN_QUYEN);
        cy.visit('/c/cmp-001/fulfillment/batches/bat-001');
        cy.contains(CHAN_QUYEN);
      });
    }

    it('ceo thấy cả Bán hàng và Giao vận', () => {
      cy.dangNhap('ceo@commerio.vn', 'ceo');
      menuThanhBen('Đơn hàng').should('exist');
      menuThanhBen('Xử lý đơn').should('exist');
      menuThanhBen('Lô nhặt hàng').should('exist');
    });
  });
});
