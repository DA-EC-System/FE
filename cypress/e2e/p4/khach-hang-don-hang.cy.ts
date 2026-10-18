// P4 · Khách hàng, đơn hàng: danh sách, tạo đơn tay, xác nhận đơn (UC-SF-01, UC-SF-02, UC-SF-04; FE#9)

const CHAN_QUYEN_BAN_HANG = 'Vai trò của bạn trong công ty này không có quyền mở trang này.';

const timKhach = (text: string) => {
  cy.findByLabelText('Tìm khách').type(text);
  cy.contains('[role=option]', text).click();
};

/** Thêm biến thể đầu tiên có giá trong kết quả tìm */
const themSanPham = (text: string) => {
  cy.findByLabelText('Thêm sản phẩm').clear().type(text);
  cy.get('[role=option][aria-disabled=false]').first().click();
};

const dienGiaoHang = () => {
  cy.findByLabelText('Trả trước').click();
};

describe('P4 · Khách hàng và đơn hàng', () => {
  context('khách hàng (UC-SF-02)', () => {
    beforeEach(() => {
      cy.dangNhap('ceo@commerio.vn', 'ceo');
      cy.menu('Khách hàng');
      cy.dong('cus-001').should('exist');
    });

    it('danh sách chỉ có khách của công ty, tìm theo tên và mở hồ sơ', () => {
      cy.get('tbody').should('not.contain', 'Lý Văn Cường');
      cy.findByPlaceholderText(/Tìm/).type('Châu');
      cy.dong('cus-001').should('not.exist');
      cy.dong('cus-003').should('contain', '0938765432').click();
      cy.location('pathname').should('eq', '/c/cmp-001/sales/customers/cus-003');
      cy.contains('h1', 'Trần Minh Châu');
      cy.contains('Lịch sử đơn');
      cy.contains('a', 'DH-1003');
    });

    it('khách của công ty khác báo không tìm thấy', () => {
      cy.visit('/c/cmp-001/sales/customers/cus-101');
      cy.contains('h1', 'Không tìm thấy');
    });
  });

  context('danh sách đơn (UC-SF-04)', () => {
    beforeEach(() => {
      cy.dangNhap('ceo@commerio.vn', 'ceo');
      cy.menu('Đơn hàng');
    });

    it('mặc định là tab chờ xác nhận, lọc đơn thiếu hàng', () => {
      cy.dong('ord-1003').should('contain', 'Chờ xác nhận');
      cy.dong('ord-1006').should('not.exist');
      cy.dong('ord-1005').should('contain', 'Thiếu hàng');
      cy.findByLabelText('Chỉ đơn thiếu hàng').click();
      cy.dong('ord-1003').should('not.exist');
      cy.dong('ord-1005').should('exist');
      cy.findByRole('tab', { name: 'Tất cả' }).click();
      cy.findByLabelText('Chỉ đơn thiếu hàng').click();
      cy.dong('ord-1006').should('exist');
      cy.get('tbody').should('not.contain', 'DH-2001');
    });
  });

  context('tạo đơn tay (UC-SF-01)', () => {
    beforeEach(() => {
      cy.dangNhap('sale@commerio.vn', 'sale');
      cy.menu('Đơn hàng');
      cy.findByRole('button', { name: 'Tạo đơn' }).click();
      cy.location('pathname').should('eq', '/c/cmp-001/sales/orders/new');
    });

    it('báo lỗi khi gửi form trống', () => {
      cy.findByRole('button', { name: 'Tạo đơn' }).click();
      cy.contains('Chọn khách hàng hoặc tạo khách mới');
      cy.contains('Thêm ít nhất một sản phẩm');
      cy.contains('Chọn cách thanh toán');
      cy.location('pathname').should('eq', '/c/cmp-001/sales/orders/new');
    });

    it('khách có sẵn: điền người nhận, chọn lại sản phẩm thì tăng số lượng, tạo đơn', () => {
      timKhach('Nguyễn Văn An');
      cy.get('[data-testid=picked-customer]').should('contain', '0901234567');
      cy.findByLabelText('Người nhận').should('have.value', 'Nguyễn Văn An');
      cy.findByLabelText('Số điện thoại người nhận').should('have.value', '0901234567');

      themSanPham('Áo thun');
      themSanPham('Áo thun');
      cy.get('[data-testid=order-lines] tbody tr[data-row-id]').should('have.length', 1);
      cy.findByLabelText(/^Số lượng /).should('have.value', '2');
      cy.findByLabelText('Phí giao (đ)').clear().type('30000');
      cy.get('[data-testid=total]').invoke('text').should('match', /\d/);
      dienGiaoHang();
      cy.findByRole('button', { name: 'Tạo đơn' }).click();
      cy.toast(/Đã tạo đơn DH-\d+/);
      cy.location('pathname').should('match', /\/c\/cmp-001\/sales\/orders\/ord-/);
      cy.contains('h1', /Đơn DH-/);
      cy.contains('Chờ xác nhận');
    });

    it('sản phẩm chưa có giá không chọn được', () => {
      cy.findByLabelText('Thêm sản phẩm').type('Quần');
      cy.contains('[role=option][aria-disabled=true]', 'Chưa có giá').click();
      cy.get('[data-testid=order-lines]').should('contain', 'Tìm và thêm sản phẩm vào đơn.');
    });

    it('khách mới trùng số điện thoại thì gợi ý dùng khách đã có', () => {
      cy.findByLabelText('Khách mới').click();
      cy.findByLabelText('Tên khách').type('An Nguyễn');
      cy.findByLabelText('Số điện thoại').type('0901234567');
      cy.contains('Đã có khách Nguyễn Văn An với số này.');
      cy.findByRole('button', { name: 'Dùng khách này' }).click();
      cy.get('[data-testid=picked-customer]').should('contain', 'Nguyễn Văn An');
    });

    it('khách mới: tạo đơn kèm khách', () => {
      cy.findByLabelText('Khách mới').click();
      cy.findByLabelText('Tên khách').type('Võ Thị Em');
      cy.findByLabelText('Số điện thoại').type('0911222333');
      cy.findByLabelText('Người nhận').should('have.value', 'Võ Thị Em');
      cy.findByLabelText('Địa chỉ giao').type('12 Lê Lợi, Q1, TP.HCM');
      themSanPham('Áo thun');
      cy.findByLabelText('Thu khi giao (COD)').click();
      cy.findByRole('button', { name: 'Tạo đơn' }).click();
      cy.toast(/Đã tạo đơn DH-/);
      cy.contains('a', 'Võ Thị Em');
    });

    it('vượt tồn khả dụng thì cảnh báo và hỏi lại trước khi tạo', () => {
      timKhach('Trần Minh Châu');
      themSanPham('Áo thun');
      cy.findByLabelText(/^Số lượng /).clear().type('9999');
      cy.contains(/Chỉ còn \d+ khả dụng/);
      dienGiaoHang();
      cy.findByRole('button', { name: 'Tạo đơn' }).click();
      cy.findByRole('alertdialog').within(() => {
        cy.contains('Đơn có sản phẩm không đủ hàng, vẫn tạo?');
        cy.findByRole('button', { name: 'Huỷ' }).click();
      });
      cy.location('pathname').should('eq', '/c/cmp-001/sales/orders/new');
      cy.findByRole('button', { name: 'Tạo đơn' }).click();
      cy.findByRole('button', { name: 'Vẫn tạo' }).click();
      cy.toast(/Đã tạo đơn DH-/);
    });

    it('lỗi từ BE gắn vào ô và báo khách không còn', () => {
      timKhach('Trần Minh Châu');
      themSanPham('Áo thun');
      dienGiaoHang();
      cy.mockApi('post', '/sales/orders', 422, {
        status: 422,
        title: 'Dữ liệu không hợp lệ',
        errors: { 'lines.0.variantId': 'Biến thể đã ngừng bán', 'shippingAddress.address': 'Địa chỉ quá ngắn' },
      });
      cy.findByRole('button', { name: 'Tạo đơn' }).click();
      cy.contains('Biến thể đã ngừng bán');
      cy.contains('Địa chỉ quá ngắn');

      cy.mockApi('post', '/sales/orders', 404, { status: 404, title: 'Không tìm thấy', code: 'not_found' });
      cy.findByRole('button', { name: 'Tạo đơn' }).click();
      cy.contains('Không tìm thấy khách hàng');
      cy.findByLabelText('Tìm khách').should('exist');
    });
  });

  context('xác nhận đơn (UC-SF-04)', () => {
    beforeEach(() => cy.dangNhap('sale@commerio.vn', 'sale'));

    it('xác nhận đơn đủ hàng', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1003');
      cy.findByRole('button', { name: 'Xác nhận đơn' }).click();
      cy.toast('Đã xác nhận đơn');
      cy.contains('Đã xác nhận');
      cy.findByRole('button', { name: 'Xác nhận đơn' }).should('not.exist');
      cy.get('[data-testid=status-history]').should('contain', 'Chờ xác nhận → Đã xác nhận');
    });

    it('thiếu hàng thì liệt kê SKU, số cần và số khả dụng', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1004');
      cy.findByRole('button', { name: 'Xác nhận đơn' }).click();
      cy.contains('Không đủ hàng');
      cy.get('[data-testid=short-lines]').should('contain', 'cần 6, khả dụng 4');
      cy.contains('Thiếu hàng');
    });

    it('đơn vừa bị người khác cập nhật thì báo và tải lại', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1003');
      cy.findByRole('button', { name: 'Xác nhận đơn' }).should('exist');
      cy.mockApi('post', '/sales/orders/ord-1003/confirm', 409, { status: 409, code: 'version_conflict' });
      cy.findByRole('button', { name: 'Xác nhận đơn' }).click();
      cy.contains('Đơn vừa được người khác cập nhật');
    });

    it('đơn sàn không có nút xác nhận và khung thanh toán', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1005');
      cy.contains('Đơn sàn tự xác nhận khi giữ được hàng');
      cy.findByRole('button', { name: 'Xác nhận đơn' }).should('not.exist');
      cy.get('[data-testid=payment-panel]').should('not.exist');
    });
  });

  context('phân quyền và cách ly (AC-R)', () => {
    it('cskh chỉ xem đơn: không tạo, không xác nhận, không tạo mã thanh toán', () => {
      cy.dangNhap('cskh@commerio.vn', 'cskh');
      cy.menu('Đơn hàng');
      cy.dong('ord-1003').should('exist');
      cy.findByRole('button', { name: 'Tạo đơn' }).should('not.exist');
      cy.dong('ord-1003').click();
      cy.contains('h1', 'Đơn DH-1003');
      cy.get('[data-testid=payment-panel]').should('contain', 'Chưa thanh toán');
      cy.findByRole('button', { name: 'Xác nhận đơn' }).should('not.exist');
      cy.findByRole('button', { name: 'Tạo mã thanh toán' }).should('not.exist');
    });

    it('kho không thấy menu bán hàng, mở thẳng URL thì bị chặn', () => {
      cy.dangNhap('kho@commerio.vn', 'kho');
      cy.contains('[data-sidebar="menu-button"]', 'Đơn hàng').should('not.exist');
      cy.contains('[data-sidebar="menu-button"]', 'Khách hàng').should('not.exist');
      cy.visit('/c/cmp-001/sales/orders');
      cy.contains(CHAN_QUYEN_BAN_HANG);
      cy.visit('/c/cmp-001/sales/customers');
      cy.contains(CHAN_QUYEN_BAN_HANG);
    });

    it('đơn của công ty khác báo không tìm thấy', () => {
      cy.dangNhap('ceo@commerio.vn', 'ceo');
      cy.visit('/c/cmp-001/sales/orders/ord-2001');
      cy.contains('h1', 'Không tìm thấy');
    });
  });
});
