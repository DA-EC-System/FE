// P4 · Tài chính: chứng từ, phiếu chi, thu COD, hoàn tiền, khoản thu chưa khớp, giao dịch cổng (UC-PF-03..07; FE#12)

const CHAN_QUYEN = 'Vai trò của bạn trong công ty này không có quyền mở trang này.';
const KHONG_QUYEN_THAO_TAC = 'Bạn không có quyền thực hiện thao tác này';
const KHOAN_DA_XU_LY = 'Khoản thu vừa được người khác xử lý. Đã tải lại.';

const ketoan = () => cy.dangNhap('ketoan@commerio.vn', 'ketoan');
const kiemsoat = () => cy.dangNhap('kiemsoat@commerio.vn', 'kiemsoat');

const tab = (name: string) => cy.findByRole('tab', { name: new RegExp(`^${name}`) });
// Ô chọn đơn mở popover cũng có role dialog nên lọc theo tiêu đề
const hopGan = () => cy.contains('[role=dialog]', 'Gán vào đơn');
const hopHoanLai = () => cy.contains('[role=dialog]', 'Hoàn lại khoản thu');

describe('P4 · Tài chính', () => {
  context('chứng từ (AC-D1 đến AC-D4)', () => {
    beforeEach(() => cy.dangNhap('ceo@commerio.vn', 'ceo'));

    it('tab Hoá đơn mặc định, lọc trạng thái, tìm, không có nút tạo; mở chi tiết và in', () => {
      cy.menu('Chứng từ');
      tab('Hoá đơn').should('have.attr', 'aria-selected', 'true');
      cy.contains('th', 'Số');
      cy.contains('th', 'Tổng tiền');
      cy.findByRole('button', { name: /Lập phiếu chi|Tạo hoá đơn/ }).should('not.exist');
      cy.get('tbody tr[data-row-id]').should('have.length.greaterThan', 0);

      cy.findByPlaceholderText(/Tìm số hoá đơn/).type('khong-co-hoa-don-nay');
      cy.contains('Không có hoá đơn phù hợp');
      cy.location('search').should('contain', 'q=');
      cy.findByPlaceholderText(/Tìm số hoá đơn/).clear();

      cy.get('tbody tr[data-row-id]').first().click();
      cy.location('pathname').should('match', /\/finance\/invoices\/inv-/);
      cy.get('[data-testid=invoice-lines]').find('tbody tr').should('have.length.greaterThan', 0);
      cy.get('[data-testid=invoice-totals]').should('contain', 'Tiền hàng').and('contain', 'Tổng cộng');
      cy.window().then((win) => cy.stub(win, 'print').as('print'));
      cy.findByRole('button', { name: 'In hoá đơn' }).click();
      cy.get('@print').should('have.been.calledOnce');
    });

    it('hoá đơn không có hoặc của công ty khác báo 404', () => {
      cy.visit('/c/cmp-001/finance/invoices/inv-khong-co');
      cy.contains('Không tìm thấy hoá đơn. Hoá đơn không tồn tại hoặc không thuộc công ty này.');
    });

    it('tab Phiếu thu: lọc nguồn, chi tiết có nguồn gốc giao dịch cổng', () => {
      cy.visit('/c/cmp-001/finance/documents?tab=receipts');
      cy.dong('rct-0002').should('contain', 'PT-000002').and('contain', 'Thu COD');
      cy.chon('Nguồn', 'Đối soát sàn');
      cy.get('tbody tr[data-row-id]').should('have.length', 1).and('contain', 'PT-000005');
      cy.findByRole('button', { name: /Lập phiếu thu/ }).should('not.exist');

      cy.visit('/c/cmp-001/finance/receipts/rct-0006');
      cy.get('[data-testid=receipt-origin]').findByRole('button', { name: 'Xem giao dịch cổng' }).click();
      cy.findByRole('dialog').within(() => {
        cy.get('[data-testid=txn-fields]').should('contain', 'VNPay');
        cy.get('[data-testid=txn-payload]').should('contain', '"sandbox": true');
        cy.findByRole('button', { name: 'Sao chép payload' }).should('exist');
      });
    });

    it('tab Phiếu chi: cột chứng từ gốc, lọc mục đích', () => {
      cy.visit('/c/cmp-001/finance/documents?tab=vouchers');
      cy.dong('pv-0002').should('contain', 'Hoàn khoản thu chưa khớp').and('contain', 'CK NHAM TAI KHOAN');
      cy.dong('pv-0003').should('contain', 'Nháp').and('contain', 'DH-1022');
      cy.chon('Mục đích', 'Hoàn tiền khách');
      cy.get('tbody tr[data-row-id]').should('have.length', 2);
      cy.dong('pv-0002').should('not.exist');
    });
  });

  context('phiếu chi (AC-V1 đến AC-V3)', () => {
    beforeEach(() => ketoan());

    it('lập phiếu chi nháp: bắt buộc ô, số tiền tự điền và khoá, mở chi tiết', () => {
      cy.visit('/c/cmp-001/finance/documents?tab=vouchers');
      cy.findByRole('button', { name: 'Lập phiếu chi' }).click();
      cy.findByRole('dialog').within(() => {
        cy.findByRole('combobox', { name: 'Mục đích' }).click();
      });
      cy.findByRole('option', { name: 'Hoàn tiền khách' }).should('exist');
      cy.findByRole('option', { name: 'Trả nhà cung cấp' }).should('not.exist');
      cy.get('body').type('{esc}');

      cy.findByRole('dialog').within(() => {
        cy.findByRole('button', { name: 'Lưu nháp' }).click();
        cy.contains('Chọn mục đích chi');
        cy.contains('Chọn chứng từ gốc');
      });
      cy.findByRole('dialog').within(() => {
        cy.chon('Mục đích', 'Hoàn khoản thu chưa khớp');
        cy.get('#voucher-source').type('CHAU');
      });
      cy.findByRole('option', { name: /CHUYEN TIEN MUA AO CHAU/ }).click();
      cy.findByRole('dialog').within(() => {
        cy.get('[data-testid=voucher-source]').should('contain', 'CHUYEN TIEN MUA AO CHAU');
        cy.get('#voucher-amount').should('be.disabled').invoke('val').should('match', /170\.000/);
        cy.findByLabelText('Ghi chú').type('Khách chuyển nhầm');
        cy.findByRole('button', { name: 'Lưu nháp' }).click();
      });
      cy.toast('Đã lập phiếu chi nháp PC-000004');
      cy.location('pathname').should('match', /\/finance\/payment-vouchers\/pv-/);
      cy.get('[data-testid=doc-status]').should('contain', 'Nháp');
    });

    it('BE trả 422 thì hiện lỗi dưới đúng ô', () => {
      cy.visit('/c/cmp-001/finance/documents?tab=vouchers');
      cy.findByRole('button', { name: 'Lập phiếu chi' }).click();
      cy.findByRole('dialog').within(() => {
        cy.chon('Mục đích', 'Hoàn tiền khách');
        cy.get('#voucher-source').type('DH-1023');
      });
      cy.findByRole('option', { name: /DH-1023/ }).click();
      cy.mockApi('post', '/finance/payment-vouchers', 422, {
        status: 422,
        code: 'validation_failed',
        errors: { orderId: 'Đơn không còn chờ hoàn tiền', note: 'Ghi chú quá dài' },
      });
      cy.findByRole('dialog').within(() => {
        cy.findByRole('button', { name: 'Lưu nháp' }).click();
        cy.contains('Đơn không còn chờ hoàn tiền');
        cy.contains('Ghi chú quá dài');
      });
    });

    it('sửa, xoá phiếu nháp; 409 thì tải lại', () => {
      cy.visit('/c/cmp-001/finance/payment-vouchers/pv-0003');
      cy.findByRole('button', { name: 'Sửa' }).click();
      cy.findByRole('dialog').within(() => {
        cy.findByLabelText('Ghi chú').type('Hoàn qua ngân hàng');
        cy.findByRole('button', { name: 'Lưu' }).click();
      });
      cy.toast('Đã lưu phiếu chi PC-000003');

      cy.findByRole('button', { name: 'Sửa' }).click();
      cy.mockApi('put', '/finance/payment-vouchers/pv-0003', 409, { status: 409, code: 'version_conflict' });
      cy.findByRole('dialog').findByRole('button', { name: 'Lưu' }).click();
      cy.contains('Phiếu chi vừa được người khác cập nhật. Đã tải lại phiếu mới nhất.');
      cy.findByRole('dialog').should('not.exist');

      cy.findByRole('button', { name: 'Xoá' }).click();
      cy.findByRole('alertdialog').should('contain', 'Xoá phiếu chi nháp PC-000003?').findByRole('button', { name: 'Xoá' }).click();
      cy.toast('Đã xoá phiếu chi PC-000003');
      cy.location('search').should('contain', 'tab=vouchers');
      cy.dong('pv-0003').should('not.exist');
    });

    it('ghi sổ phiếu chi: đơn sang Đã hoàn, phiếu posted không còn nút', () => {
      cy.visit('/c/cmp-001/finance/payment-vouchers/pv-0003');
      cy.findByRole('button', { name: 'Ghi sổ' }).click();
      cy.findByRole('alertdialog')
        .should('contain', 'Ghi sổ phiếu chi PC-000003 số tiền 350.000')
        .and('contain', 'Sau khi ghi sổ không sửa, xoá được.')
        .findByRole('button', { name: 'Ghi sổ' })
        .click();
      cy.toast('Đã ghi sổ phiếu chi PC-000003');
      cy.get('[data-testid=doc-status]').should('contain', 'Đã ghi sổ');
      cy.get('[data-testid=voucher-posted]').should('contain', 'Đặng Thu Ngân');
      cy.findByRole('button', { name: /^(Sửa|Xoá|Ghi sổ)$/ }).should('not.exist');

      // cy.visit dựng lại dữ liệu mock nên đi bằng menu
      cy.menu('Hoàn tiền');
      tab('Đã hoàn').click();
      cy.dong('ord-1022').should('contain', 'PC-000003');
    });

    it('ghi sổ bị 409 already_processed thì hiện detail của BE', () => {
      cy.visit('/c/cmp-001/finance/payment-vouchers/pv-0003');
      cy.findByRole('button', { name: 'Ghi sổ' }).click();
      cy.mockApi('post', '/finance/payment-vouchers/pv-0003/post', 409, {
        status: 409,
        code: 'already_processed',
        detail: 'Chứng từ gốc đã có phiếu chi ghi sổ PC-000009',
      });
      cy.findByRole('alertdialog').findByRole('button', { name: 'Ghi sổ' }).click();
      cy.contains('Chứng từ gốc đã có phiếu chi ghi sổ PC-000009');
      cy.contains('[data-sonner-toast]', 'Đã ghi sổ').should('not.exist');
    });
  });

  context('thu COD (AC-K1 đến AC-K3)', () => {
    beforeEach(() => ketoan());

    it('ba tab, tab Chờ thu chỉ có đơn đã giao; tab Không thu có ngày giao trống', () => {
      cy.menu('Thu COD');
      tab('Chờ thu').should('have.attr', 'aria-selected', 'true');
      cy.get('tbody tr[data-row-id]').should('have.length', 3);
      cy.dong('ord-1008').should('not.exist');
      cy.findByPlaceholderText(/Tìm mã đơn/).type('DH-1019');
      cy.get('tbody tr[data-row-id]').should('have.length', 1);
      cy.findByPlaceholderText(/Tìm mã đơn/).clear();
      cy.get('tbody tr[data-row-id]').should('have.length', 3);

      tab('Đã thu').click();
      cy.dong('ord-1021').find('a').should('contain', 'PT-000002');
      cy.findByRole('checkbox').should('not.exist');
      tab('Không thu').click();
      cy.dong('ord-1001').should('contain', '—');
    });

    it('xác nhận theo lô: tổng tiền, hộp xác nhận, phiếu thu, sang tab Đã thu', () => {
      cy.visit('/c/cmp-001/finance/cod');
      cy.findByRole('button', { name: /Xác nhận đã nhận tiền/ }).should('be.disabled');
      cy.get('tbody tr[data-row-id]').should('have.length', 3);
      cy.findByRole('checkbox', { name: 'Chọn cả trang' }).click();
      cy.get('[data-testid=cod-total]').should('contain', 'Tổng');
      cy.findByRole('button', { name: 'Xác nhận đã nhận tiền (3)' }).click();
      cy.findByRole('alertdialog')
        .should('contain', 'của 3 đơn COD? Mỗi đơn sinh một phiếu thu.')
        .findByRole('button', { name: 'Xác nhận' })
        .click();
      cy.toast('Đã xác nhận 3 đơn COD, lập phiếu thu PT-000007 đến PT-000009');
      cy.contains('Chưa có đơn COD');
      tab('Đã thu').click();
      cy.dong('ord-1018').should('contain', 'PT-0000');
    });

    it('409 payment_state_changed: không xác nhận đơn nào, gắn nhãn, giữ đơn còn lại', () => {
      cy.visit('/c/cmp-001/finance/cod');
      cy.findByRole('checkbox', { name: 'Chọn DH-1018' }).click();
      cy.findByRole('checkbox', { name: 'Chọn DH-1019' }).click();
      cy.findByRole('button', { name: 'Xác nhận đã nhận tiền (2)' }).click();
      cy.mockApi('post', '/finance/cod-confirmations', 409, {
        status: 409,
        code: 'payment_state_changed',
        orders: [{ orderId: 'ord-1018', code: 'DH-1018', status: 'cod_collected' }],
      });
      cy.findByRole('alertdialog').findByRole('button', { name: 'Xác nhận' }).click();
      cy.contains('Có đơn vừa thay đổi, chưa xác nhận đơn nào');
      cy.get('[data-testid=cod-changed]').should('contain', 'DH-1018: Đã thay đổi');
      cy.dong('ord-1018').should('contain', 'Đã thay đổi');
      // Checkbox Radix là button nên kiểm aria-checked thay cho :checked
      cy.findByRole('checkbox', { name: 'Chọn DH-1018' }).should('have.attr', 'aria-checked', 'false');
      cy.findByRole('checkbox', { name: 'Chọn DH-1019' }).should('have.attr', 'aria-checked', 'true');
      cy.findByRole('button', { name: 'Xác nhận đã nhận tiền (1)' }).should('be.enabled');
    });
  });

  context('hoàn tiền (AC-R1, AC-R2)', () => {
    beforeEach(() => ketoan());

    it('danh sách chờ hoàn và đã hoàn', () => {
      cy.menu('Hoàn tiền');
      tab('Chờ hoàn tiền').should('have.attr', 'aria-selected', 'true');
      cy.dong('ord-1022').should('contain', 'VNPay');
      cy.dong('ord-1023').should('contain', 'Gán khoản chưa khớp');
      tab('Đã hoàn').click();
      cy.dong('ord-1024').should('contain', 'PC-000001');
    });

    it('hoàn một bước: toast, sang tab Đã hoàn, chi tiết đơn Đã hoàn tiền', () => {
      cy.visit('/c/cmp-001/finance/refunds');
      cy.dong('ord-1023').findByRole('button', { name: 'Hoàn tiền' }).click();
      cy.findByRole('dialog').within(() => {
        cy.get('[data-testid=refund-summary]').should('contain', 'DH-1023').and('contain', '180.000');
        cy.findByLabelText('Ngày chi').invoke('val').should('match', /^\d{4}-\d{2}-\d{2}$/);
        cy.findByLabelText('Ghi chú').type('Chuyển khoản lại cho khách');
        cy.findByRole('button', { name: 'Hoàn tiền' }).click();
      });
      cy.toast(/^Đã hoàn 180\.000\s₫ cho đơn DH-1023, phiếu chi PC-000004$/);
      cy.dong('ord-1023').should('not.exist');
      tab('Đã hoàn').click();
      cy.dong('ord-1023').should('contain', 'PC-000004');

      cy.dong('ord-1023').contains('a', 'DH-1023').click();
      cy.get('[data-testid=payment-panel]').should('contain', 'Đã hoàn tiền');
    });

    it('409 already_processed và payment_state_changed thì đóng hộp và báo', () => {
      cy.visit('/c/cmp-001/finance/refunds');
      cy.dong('ord-1023').findByRole('button', { name: 'Hoàn tiền' }).click();
      cy.mockApi('post', '/finance/refunds', 409, {
        status: 409,
        code: 'already_processed',
        detail: 'Chứng từ gốc đã có phiếu chi ghi sổ PC-000007',
      });
      cy.findByRole('dialog').findByRole('button', { name: 'Hoàn tiền' }).click();
      cy.contains('Đơn vừa được người khác hoàn tiền (PC-000007).');
      cy.findByRole('dialog').should('not.exist');

      cy.dong('ord-1023').findByRole('button', { name: 'Hoàn tiền' }).click();
      cy.mockApi('post', '/finance/refunds', 409, { status: 409, code: 'payment_state_changed' });
      cy.findByRole('dialog').findByRole('button', { name: 'Hoàn tiền' }).click();
      cy.contains('Đơn không còn chờ hoàn tiền.');
      cy.findByRole('dialog').should('not.exist');
    });

    it('BE trả 403 thì báo không có quyền, không toast thành công (AC-P3)', () => {
      cy.visit('/c/cmp-001/finance/refunds');
      cy.dong('ord-1023').findByRole('button', { name: 'Hoàn tiền' }).click();
      cy.mockApi('post', '/finance/refunds', 403, { status: 403, code: 'forbidden' });
      cy.findByRole('dialog').findByRole('button', { name: 'Hoàn tiền' }).click();
      cy.findByRole('dialog').should('contain', KHONG_QUYEN_THAO_TAC);
      cy.get('[data-sonner-toast]').should('not.exist');
    });
  });

  context('khoản thu chưa khớp (AC-U1 đến AC-U3)', () => {
    beforeEach(() => ketoan());

    it('ba tab, cột kết quả, lọc lý do', () => {
      cy.menu('Khoản thu chưa khớp');
      tab('Chưa xử lý').should('have.attr', 'aria-selected', 'true');
      cy.get('tbody tr[data-row-id]').should('have.length', 3);
      cy.dong('um-0002').should('contain', 'Lệch số tiền').and('contain', 'DH-1014');
      cy.chon('Lý do', 'Đơn đã huỷ');
      cy.get('tbody tr[data-row-id]').should('have.length', 1);
      cy.dong('um-0003').should('exist');

      cy.visit('/c/cmp-001/finance/unmatched');
      tab('Đã gán').click();
      cy.dong('um-0004').should('contain', 'DH-1023').and('contain', 'PT-000004');
      cy.findByRole('button', { name: 'Gán vào đơn' }).should('not.exist');
      tab('Đã hoàn lại').click();
      cy.dong('um-0005').should('contain', 'PC-000002');
    });

    it('gán vào đơn khớp tiền: toast, sang tab Đã gán', () => {
      cy.visit('/c/cmp-001/finance/unmatched');
      cy.dong('um-0001').findByRole('button', { name: 'Gán vào đơn' }).click();
      hopGan().within(() => {
        cy.contains('CHUYEN TIEN MUA AO CHAU');
        cy.get('#assign-order').type('DH-1007');
      });
      cy.findByRole('option', { name: /DH-1007/ }).click();
      hopGan().within(() => {
        cy.get('[data-testid=assign-order]').should('contain', 'DH-1007').and('not.contain', 'Lệch');
        cy.findByRole('button', { name: 'Gán' }).click();
      });
      cy.toast(/^Đã gán vào đơn DH-1007, phiếu thu PT-000007$/);
      cy.dong('um-0001').should('not.exist');
      tab('Đã gán').click();
      cy.dong('um-0001').should('contain', 'DH-1007');
    });

    it('đơn gợi ý chọn sẵn, lệch tiền thì khoá nút Gán', () => {
      cy.visit('/c/cmp-001/finance/unmatched');
      cy.dong('um-0002').findByRole('button', { name: 'Gán vào đơn' }).click();
      hopGan().within(() => {
        cy.get('[data-testid=assign-order]').should('contain', 'DH-1014').and('contain', 'Lệch');
        cy.findByRole('button', { name: 'Gán' }).should('be.disabled');
      });
    });

    it('gán bị 422 và 409: lỗi dưới ô, giữ hoặc đóng hộp', () => {
      cy.visit('/c/cmp-001/finance/unmatched');
      cy.dong('um-0001').findByRole('button', { name: 'Gán vào đơn' }).click();
      hopGan().find('#assign-order').type('DH-1007');
      cy.findByRole('option', { name: /DH-1007/ }).click();

      cy.mockApi('post', '/finance/unmatched-receipts/um-0001/assign', 422, {
        status: 422,
        code: 'amount_mismatch',
        errors: { orderId: 'Số tiền khoản thu khác tổng đơn' },
      });
      hopGan().findByRole('button', { name: 'Gán' }).click();
      hopGan().should('contain', 'Số tiền khoản thu khác tổng đơn');

      cy.mockApi('post', '/finance/unmatched-receipts/um-0001/assign', 409, {
        status: 409,
        code: 'payment_state_changed',
        current: { orderId: 'ord-1007', status: 'paid' },
      });
      hopGan().findByRole('button', { name: 'Gán' }).click();
      hopGan().should('contain', 'Đơn không còn chờ thanh toán (Đã thanh toán).');
      hopGan().find('#assign-order').type('DH-1007');
      cy.findByRole('option', { name: /DH-1007/ }).click();

      cy.mockApi('post', '/finance/unmatched-receipts/um-0001/assign', 409, { status: 409, code: 'version_conflict' });
      hopGan().findByRole('button', { name: 'Gán' }).click();
      hopGan().should('not.exist');
      cy.contains(KHOAN_DA_XU_LY);
    });

    it('hoàn lại khoản thu; 409 thì đóng và báo', () => {
      cy.visit('/c/cmp-001/finance/unmatched');
      cy.dong('um-0003').findByRole('button', { name: 'Hoàn lại' }).click();
      cy.mockApi('post', '/finance/unmatched-receipts/um-0003/refund', 409, { status: 409, code: 'already_processed' });
      hopHoanLai().findByRole('button', { name: 'Hoàn lại' }).click();
      cy.contains(KHOAN_DA_XU_LY);
      hopHoanLai().should('not.exist');

      cy.dong('um-0003').findByRole('button', { name: 'Hoàn lại' }).click();
      hopHoanLai().within(() => {
        cy.contains('115.000');
        cy.findByRole('button', { name: 'Hoàn lại' }).click();
      });
      cy.toast(/^Đã hoàn lại 115\.000\s₫, phiếu chi PC-000004$/);
      tab('Đã hoàn lại').click();
      cy.dong('um-0003').should('contain', 'PC-000004');
    });
  });

  context('giao dịch cổng (AC-G1, AC-G2)', () => {
    beforeEach(() => kiemsoat());

    it('danh sách, lọc, link khoản thu chưa khớp; khung chi tiết chỉ xem', () => {
      cy.menu('Giao dịch cổng');
      cy.dong('txn-0006').should('contain', 'Cần xem lại').and('contain', 'SePay').find('a').should('contain', 'Xem khoản thu chưa khớp');
      cy.dong('txn-0001').should('contain', 'PT-000006');
      cy.chon('Trạng thái', 'Thất bại');
      cy.get('tbody tr[data-row-id]').should('have.length', 1);
      cy.dong('txn-0004').click();
      cy.location('search').should('contain', 'txn=txn-0004');
      cy.findByRole('dialog').within(() => {
        cy.get('[data-testid=txn-fields]').should('contain', 'MoMo');
        cy.get('[data-testid=txn-payload]').should('contain', '"resultCode": 1006');
        cy.findByRole('button', { name: /Payload gốc/ }).click();
        cy.get('[data-testid=txn-payload]').should('not.exist');
        cy.findAllByRole('button').each(($b) => expect($b.text()).not.to.match(/Gán|Hoàn|Xoá|Sửa|Ghi sổ/));
      });
    });
  });

  context('phân quyền (AC-P1)', () => {
    const NHOM = ['Chứng từ', 'Thu COD', 'Hoàn tiền', 'Khoản thu chưa khớp'];
    const coMenu = (labels: string[], co: boolean) =>
      labels.forEach((l) =>
        cy.contains('[data-sidebar="menu-button"]', new RegExp(`^\\s*${l}\\s*$`)).should(co ? 'exist' : 'not.exist'),
      );

    it('CEO thấy cả năm mục và có nút ghi tiền', () => {
      cy.dangNhap('ceo@commerio.vn', 'ceo');
      coMenu([...NHOM, 'Giao dịch cổng'], true);
      cy.menu('Thu COD');
      cy.findByRole('checkbox', { name: 'Chọn cả trang' }).should('exist');
    });

    it('Kế toán không thấy Giao dịch cổng, gõ đường dẫn bị chặn', () => {
      ketoan();
      coMenu(NHOM, true);
      coMenu(['Giao dịch cổng'], false);
      cy.visit('/c/cmp-001/payment/transactions');
      cy.contains(CHAN_QUYEN);
    });

    it('Kiểm soát thấy cả năm mục nhưng không có nút ghi tiền', () => {
      kiemsoat();
      coMenu([...NHOM, 'Giao dịch cổng'], true);
      cy.visit('/c/cmp-001/finance/cod');
      cy.dong('ord-1018').should('exist');
      cy.findByRole('checkbox').should('not.exist');
      cy.findByRole('button', { name: /Xác nhận đã nhận tiền/ }).should('not.exist');
      cy.visit('/c/cmp-001/finance/refunds');
      cy.dong('ord-1022').findByRole('button', { name: 'Hoàn tiền' }).should('not.exist');
      cy.visit('/c/cmp-001/finance/unmatched');
      cy.dong('um-0001').findByRole('button').should('not.exist');
      cy.visit('/c/cmp-001/finance/documents?tab=vouchers');
      cy.dong('pv-0003').should('exist');
      cy.findByRole('button', { name: 'Lập phiếu chi' }).should('not.exist');
      cy.visit('/c/cmp-001/finance/payment-vouchers/pv-0003');
      cy.get('[data-testid=doc-status]').should('contain', 'Nháp');
      cy.findByRole('button', { name: /^(Sửa|Xoá|Ghi sổ)$/ }).should('not.exist');
    });

    it('Admin không có nhóm Tài chính', () => {
      cy.dangNhap('admin@commerio.vn', 'admin');
      cy.menu('Tổng quan');
      coMenu([...NHOM, 'Giao dịch cổng'], false);
    });

    it('Kho không có nhóm Tài chính', () => {
      cy.dangNhap('kho@commerio.vn', 'kho');
      cy.menu('Tổng quan');
      coMenu([...NHOM, 'Giao dịch cổng'], false);
    });

    it('Sale không có nhóm Tài chính, gõ đường dẫn bị chặn', () => {
      cy.dangNhap('sale@commerio.vn', 'sale');
      cy.menu('Tổng quan');
      coMenu([...NHOM, 'Giao dịch cổng'], false);
      cy.visit('/c/cmp-001/finance/cod');
      cy.contains(CHAN_QUYEN);
    });
  });
});
