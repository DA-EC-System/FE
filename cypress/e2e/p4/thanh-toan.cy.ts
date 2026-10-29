// P4 · Thanh toán: mã thanh toán của đơn, cổng thanh toán, trang kết quả (UC-PF-01, UC-PF-11; FE#9)

const CHAN_QUYEN_THANH_TOAN = 'Vai trò của bạn trong công ty này không có quyền mở trang này.';

const khung = () => cy.get('[data-testid=payment-panel]');

const moHopThoaiTaoMa = () => {
  khung().findByRole('button', { name: 'Tạo mã thanh toán' }).click();
  return cy.findByRole('dialog');
};

/** Giả lập khách đã trả (Documents/21 mục 12.11) */
const khachTra = (paymentCode: string) =>
  cy.window().then((win) => win.fetch(`/api/v1/payment/dev/simulate/${paymentCode}`, { method: 'POST' }));

describe('P4 · Thanh toán', () => {
  context('mã thanh toán của đơn (UC-PF-11)', () => {
    beforeEach(() => {
      cy.dangNhap('sale@commerio.vn', 'sale');
    });

    it('tạo mã VietQR: QR, chuyển khoản, đếm ngược; khách trả thì đổi sang đã thanh toán', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1003');
      khung().should('contain', 'Chưa thanh toán');
      moHopThoaiTaoMa().within(() => {
        cy.findByLabelText('MoMo').should('be.disabled');
        cy.findByLabelText('ZaloPay').should('be.disabled');
        cy.contains('Chưa cấu hình');
        cy.findByLabelText('VietQR').click();
        cy.findByRole('button', { name: 'Tạo mã' }).click();
      });
      cy.toast('Đã tạo mã thanh toán');
      cy.get('[data-testid=active-link]').within(() => {
        cy.get('svg[aria-label^="QR thanh toán"]').should('exist');
        cy.get('[data-testid=countdown]').invoke('text').should('match', /^\d{2}:\d{2}/);
        cy.get('[data-testid=bank-transfer]').should('contain', 'Vietcombank').and('contain', '0071000123456');
        cy.findByRole('button', { name: 'Sao chép số tài khoản' }).should('exist');
        cy.findByRole('button', { name: 'Sao chép nội dung chuyển khoản' }).should('exist');
      });
      khung().findByRole('button', { name: 'Tạo mã thanh toán' }).should('not.exist');

      cy.get('[data-testid=payment-code]')
        .invoke('text')
        .then((code) => khachTra(code));
      // Chưa có SSE: khung hỏi lại mỗi 5 giây
      khung().contains('Đã nhận tiền lúc', { timeout: 10000 });
      khung().should('contain', 'Đã thanh toán');
      cy.get('[data-testid=active-link]').should('not.exist');
    });

    it('cổng VNPay có link để sao chép, không có thông tin chuyển khoản', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1003');
      moHopThoaiTaoMa().within(() => {
        cy.findByLabelText('VNPay').click();
        cy.findByRole('button', { name: 'Tạo mã' }).click();
      });
      cy.get('[data-testid=active-link]').within(() => {
        cy.findByRole('button', { name: 'Sao chép link thanh toán' }).should('contain', 'Sao chép link');
        cy.get('[data-testid=bank-transfer]').should('not.exist');
      });
    });

    it('lỗi khi tạo mã giữ hộp thoại mở', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1003');
      moHopThoaiTaoMa();
      cy.findByRole('dialog').findByRole('button', { name: 'Tạo mã' }).click();
      cy.findByRole('dialog').should('contain', 'Chọn cổng thanh toán');
      cy.findByRole('dialog').findByLabelText('VNPay').click();

      cy.mockApi('post', '/payment/orders/ord-1003/links', 502, { status: 502, code: 'gateway_unavailable' });
      cy.findByRole('dialog').findByRole('button', { name: 'Tạo mã' }).click();
      cy.findByRole('dialog').should('contain', 'Cổng thanh toán đang lỗi, thử lại sau hoặc chọn cổng khác');

      cy.mockApi('post', '/payment/orders/ord-1003/links', 422, {
        status: 422,
        code: 'gateway_not_configured',
        errors: { gateway: 'Cổng này chưa được cấu hình' },
      });
      cy.findByRole('dialog').findByRole('button', { name: 'Tạo mã' }).click();
      cy.findByRole('dialog').should('contain', 'Cổng này chưa được cấu hình');

      cy.mockApi('post', '/payment/orders/ord-1003/links', 409, {
        status: 409,
        code: 'payment_not_allowed',
        detail: 'Đơn đã được thanh toán.',
      });
      cy.findByRole('dialog').findByRole('button', { name: 'Tạo mã' }).click();
      cy.findByRole('dialog').should('contain', 'Đơn đã được thanh toán.');
    });

    it('BE trả mã còn hiệu lực (200) thì báo đơn đã có mã', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1003');
      moHopThoaiTaoMa().findByLabelText('VNPay').click();
      cy.mockApi('post', '/payment/orders/ord-1003/links', 200, {
        id: 'pay-x',
        orderId: 'ord-1003',
        gateway: 'vnpay',
        paymentCode: 'CMRXXXXXXXXX',
        amount: 330000,
        payUrl: null,
        qrContent: 'CMRXXXXXXXXX',
        bankTransfer: null,
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        status: 'active',
        createdAt: new Date().toISOString(),
        createdBy: { id: 'acc-x', name: 'Người khác' },
      });
      cy.findByRole('dialog').findByRole('button', { name: 'Tạo mã' }).click();
      cy.findByRole('dialog').should('not.exist');
      khung().should('contain', 'Đơn đã có mã thanh toán còn hiệu lực');
    });

    it('mã cũ hết hạn thì cho tạo lại; lịch sử mã thu gọn mặc định', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1007');
      khung().should('contain', 'Mã đã hết hạn');
      cy.get('[data-testid=link-history]').should('not.exist');
      khung().findByRole('button', { name: /Lịch sử mã/ }).click();
      cy.get('[data-testid=link-history]').should('contain', 'CMR4XN8PAD6E').and('contain', 'Hết hạn');
      khung().findByRole('button', { name: 'Tạo lại' }).click();
      cy.findByRole('dialog').within(() => {
        cy.findByLabelText('VietQR').click();
        cy.findByRole('button', { name: 'Tạo mã' }).click();
      });
      cy.get('[data-testid=active-link]').should('exist');
      khung().should('not.contain', 'Mã đã hết hạn');
    });

    it('đơn đã trả và đơn COD không có nút tạo mã', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1006');
      khung().should('contain', 'Đã thanh toán').and('contain', 'Đã nhận tiền lúc');
      khung().findByRole('button', { name: 'Tạo mã thanh toán' }).should('not.exist');
      cy.visit('/c/cmp-001/sales/orders/ord-1008');
      khung().should('contain', 'Chờ thu COD');
      khung().findByRole('button', { name: 'Tạo mã thanh toán' }).should('not.exist');
    });
  });

  context('cổng thanh toán (UC-PF-01)', () => {
    beforeEach(() => {
      cy.dangNhap('ceo@commerio.vn', 'ceo');
      cy.menu('Cổng thanh toán');
      cy.location('pathname').should('eq', '/c/cmp-001/settings/payment-gateways');
    });

    it('4 cổng với trạng thái, khoá che, webhook VietQR', () => {
      cy.get('[data-testid=gateway-vnpay]').should('contain', 'Đã cấu hình').and('contain', '••••4821');
      cy.get('[data-testid=gateway-vnpay]').should('not.contain', 'SANDBOXHASHSECRET4821');
      cy.get('[data-testid=gateway-momo]').should('contain', 'Chưa cấu hình');
      cy.get('[data-testid=gateway-zalopay]').should('contain', 'Chưa cấu hình');
      cy.get('[data-testid=gateway-vietqr]').within(() => {
        cy.contains('Vietcombank');
        cy.get('[data-testid=webhook-url]').invoke('text').should('match', /^https:\/\/.+\/sepay\//);
        cy.findByRole('button', { name: 'Sao chép URL webhook' }).should('exist');
        cy.contains('Dán URL này vào SePay');
      });
    });

    it('cấu hình cổng mới: form trống, ô ẩn ký tự, bắt buộc đủ ô', () => {
      cy.get('[data-testid=gateway-momo]').findByRole('button', { name: 'Cấu hình' }).click();
      cy.findByRole('dialog').within(() => {
        cy.findByLabelText('Secret Key').should('have.value', '').and('have.attr', 'type', 'password');
        cy.findByRole('button', { name: 'Lưu khoá' }).click();
        cy.contains('Bắt buộc nhập');
        cy.findByLabelText('Partner Code').type('MOMOTEST01');
        cy.findByLabelText('Access Key').type('ACCESSKEY9001');
        cy.findByLabelText('Secret Key').type('SECRETKEY5555');
        cy.findAllByRole('button', { name: 'Hiện mật khẩu' }).last().click();
        cy.findByLabelText('Secret Key').should('have.attr', 'type', 'text');
        cy.findByRole('button', { name: 'Lưu khoá' }).click();
      });
      cy.toast('Đã lưu khoá cổng MoMo');
      cy.get('[data-testid=gateway-momo]').should('contain', 'Đã cấu hình').and('contain', '••••5555');
      cy.get('[data-testid=gateway-momo]').findByRole('button', { name: 'Thay khoá' }).should('exist');
    });

    it('khoá vừa bị người khác đổi thì báo xung đột', () => {
      cy.get('[data-testid=gateway-vnpay]').findByRole('button', { name: 'Thay khoá' }).click();
      cy.findByRole('dialog').within(() => {
        cy.findByLabelText('Mã website (TMN Code)').should('have.value', '').type('NEWTMN01');
        cy.findByLabelText('Chuỗi bí mật (Hash Secret)').type('NEWHASH0001');
      });
      cy.mockApi('put', '/payment/gateways/vnpay', 409, { status: 409, code: 'version_conflict' });
      cy.findByRole('dialog').findByRole('button', { name: 'Lưu khoá' }).click();
      cy.findByRole('dialog').should('contain', 'Khoá vừa được người khác đổi');
    });
  });

  context('phân quyền và trang kết quả', () => {
    it('sale không thấy menu cổng thanh toán, mở URL thì bị chặn', () => {
      cy.dangNhap('sale@commerio.vn', 'sale');
      cy.contains('[data-sidebar="menu-button"]', 'Cổng thanh toán').should('not.exist');
      cy.visit('/c/cmp-001/settings/payment-gateways');
      cy.contains(CHAN_QUYEN_THANH_TOAN);
    });

    it('trang kết quả không đọc tham số cổng trả về', () => {
      cy.visit('/thanh-toan/ket-qua?vnp_ResponseCode=24&vnp_TxnRef=CMRABC');
      cy.contains('Đã nhận yêu cầu thanh toán. Cửa hàng sẽ xác nhận khi nhận được tiền.');
      cy.get('body').should('not.contain', 'CMRABC');
    });
  });
});
