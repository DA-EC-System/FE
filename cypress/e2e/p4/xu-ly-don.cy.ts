// P4 · Xử lý đơn theo kiện (sơ đồ D1, D2; FE#59): huỷ đơn, hàng đợi kiện, quét đóng gói, bàn giao, cập nhật giao

const CHAN_QUYEN = 'Vai trò của bạn trong công ty này không có quyền mở trang này.';

const khung = () => cy.get('[data-testid=payment-panel]');
const lichSu = () => cy.get('[data-testid=status-history] li').first();
const kienCuaDon = () => cy.get('[data-testid=order-packages] tbody tr').first();
const trangThaiKien = () => cy.get('[data-testid=package-status]');
const nutKien = (name: string) => cy.get('[data-testid=package-actions]').findByRole('button', { name });
// Hộp xác nhận (ConfirmDialog) là alertdialog, hộp nhập liệu là dialog
const menuThanhBen = (label: string) => cy.contains('[data-sidebar="menu-button"]', new RegExp(`^\\s*${label}\\s*$`));

/** Quét đủ mọi dòng của kiện ở màn đóng gói */
const quetDu = () =>
  cy.get('[data-testid=pack-lines] tbody tr').each(($tr) => {
    const sku = $tr.attr('data-row-id') ?? '';
    const qty = Number($tr.find('td').last().text().split('/')[1]);
    for (let i = 0; i < qty; i++) cy.get('#scan-sku').type(`${sku}{enter}`);
  });

describe('P4 · Xử lý đơn', () => {
  context('huỷ đơn (sơ đồ D1)', () => {
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
      kienCuaDon().should('contain', 'Đã huỷ');
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
      cy.get('[data-testid=order-status]').should('contain', 'Chưa thanh toán');
    });

    it('BE báo đơn đã đổi trạng thái thì đóng hộp thoại và tải lại', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1013');
      cy.findByRole('button', { name: 'Huỷ đơn' }).should('exist');
      cy.mockApi('post', '/sales/orders/ord-1013/cancel', 409, { status: 409, code: 'already_handed_over' });
      cy.findByRole('button', { name: 'Huỷ đơn' }).click();
      cy.findByLabelText('Lý do huỷ').type('Khách đổi ý');
      cy.findByRole('dialog').findByRole('button', { name: 'Huỷ đơn' }).click();
      cy.findByRole('dialog').should('not.exist');
      cy.contains('Đơn vừa được người khác cập nhật');
    });

    it('đơn đã có kiện bàn giao thì không huỷ được', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1016');
      kienCuaDon().should('contain', 'Đang giao');
      cy.findByRole('button', { name: 'Huỷ đơn' }).should('not.exist');
    });

    it('đơn sàn không có nút huỷ, có ghi chú', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1015');
      cy.contains('Đơn sàn: trạng thái thanh toán, giao và huỷ lấy từ sàn.');
      cy.get('[data-testid=order-status]').should('contain', 'Đang xử lý').and('contain', 'Sàn: AWAITING_COLLECTION');
      cy.findByRole('button', { name: 'Huỷ đơn' }).should('not.exist');
    });
  });

  context('huỷ đơn có kiện đã đóng gói (sơ đồ D1, D2)', () => {
    it('đơn Đang huỷ tới khi mở kiện', () => {
      cy.dangNhap('ceo@commerio.vn', 'ceo');
      cy.visit('/c/cmp-001/fulfillment/packages/pkg-1010/pack');
      quetDu();
      cy.findByRole('button', { name: 'Đóng gói' }).click();
      cy.toast('Đã đóng gói kiện');
      cy.contains('a', 'DH-1010').click();
      cy.findByRole('button', { name: 'Huỷ đơn' }).click();
      cy.findByRole('dialog').within(() => {
        cy.contains('1 kiện đã đóng gói phải mở');
        cy.findByLabelText('Lý do huỷ').type('Khách đổi ý');
        cy.findByRole('button', { name: 'Huỷ đơn' }).click();
      });
      cy.toast('Đã huỷ đơn DH-1010, còn 1 kiện chờ mở');
      cy.get('[data-testid=order-status]').should('contain', 'Đang huỷ');
      kienCuaDon().should('contain', 'Chờ mở kiện').find('a').click();
      nutKien('Mở kiện, huỷ').click();
      cy.findByRole('alertdialog').findByRole('button', { name: 'Mở kiện, huỷ' }).click();
      trangThaiKien().should('contain', 'Đã huỷ');
      cy.contains('a', 'DH-1010').click();
      cy.get('[data-testid=order-status]').should('contain', 'Đã huỷ').and('not.contain', 'Đang huỷ');
    });
  });

  context('hàng đợi kiện (sơ đồ D2)', () => {
    beforeEach(() => {
      cy.dangNhap('kho@commerio.vn', 'kho');
      cy.menu('Kiện hàng');
      cy.dong('pkg-1006').should('exist');
    });

    it('Cần đóng gói chỉ có kiện của đơn đang xử lý; danh sách nhặt gộp kiện chọn', () => {
      cy.findByRole('tab', { name: /Cần đóng gói/ }).should('have.attr', 'data-state', 'active');
      cy.dong('pkg-1003').should('not.exist');
      cy.dong('pkg-1004').should('not.exist');
      cy.findByRole('checkbox', { name: 'Chọn KH-000010' }).click();
      cy.findByRole('checkbox', { name: 'Chọn KH-000011' }).click();
      cy.findByRole('button', { name: 'Danh sách nhặt (2 kiện)' }).click();
      cy.contains('Danh sách nhặt · 2 kiện đã chọn');
      cy.get('[data-testid=pick-list] tbody tr').should('have.length', 2);
      cy.get('[data-testid=pick-list] tbody tr').first().should('contain', '3').and('contain', '2');
      cy.findByRole('button', { name: 'In' }).should('exist');
    });

    it('quét đóng gói đủ món, báo sàn sẵn sàng rồi bàn giao', () => {
      cy.dong('pkg-1010').click();
      cy.contains('h1', 'Kiện KH-000010');
      trangThaiKien().should('contain', 'Đã giữ hàng');
      nutKien('Đóng gói').click();
      cy.contains('h1', 'Đóng gói kiện KH-000010');
      cy.findByRole('button', { name: 'Đóng gói' }).should('be.disabled');
      cy.get('#scan-sku').type('KHONG-CO{enter}');
      cy.contains('KHONG-CO không có trong kiện');
      quetDu();
      cy.findByRole('button', { name: 'Đóng gói' }).click();
      cy.toast('Đã đóng gói kiện KH-000010');
      trangThaiKien().should('contain', 'Đã đóng gói');

      nutKien('Báo sàn sẵn sàng').click();
      trangThaiKien().should('contain', 'Chờ lấy hàng');
      cy.contains('Mã vận đơn').next().should('not.contain', '—');
      nutKien('Bàn giao').click();
      cy.toast('Đã bàn giao kiện KH-000010');
      trangThaiKien().should('contain', 'Đang giao');
      cy.get('[data-testid=status-history]').should('contain', 'Chờ lấy hàng');
    });

    it('kiện chưa thanh toán không vào được màn đóng gói', () => {
      cy.visit('/c/cmp-001/fulfillment/packages/pkg-1003/pack');
      cy.contains('Kiện KH-000003 không ở bước đóng gói');
    });

    it('bàn giao hàng loạt ở Chờ lấy hàng', () => {
      cy.findByRole('tab', { name: /Chờ lấy hàng/ }).click();
      cy.location('search').should('contain', 'tab=awaiting_pickup');
      cy.findByRole('button', { name: /Bàn giao/ }).should('be.disabled');
      cy.dong('pkg-1015').find('[role=checkbox]').click();
      cy.findByRole('button', { name: 'Bàn giao (1)' }).click();
      cy.findByRole('alertdialog').within(() => {
        cy.contains('Bàn giao 1 kiện');
        cy.findByRole('button', { name: 'Bàn giao' }).click();
      });
      cy.toast('Đã bàn giao 1 kiện');
      cy.dong('pkg-1015').should('not.exist');
      cy.findByRole('tab', { name: /Đang giao/ }).click();
      cy.dong('pkg-1015').should('exist');
    });

    it('kiện bàn giao lỗi giữ lại, có lý do ở từng kiện', () => {
      cy.findByRole('tab', { name: /Chờ lấy hàng/ }).click();
      cy.dong('pkg-1015').find('[role=checkbox]').click();
      cy.mockApi('post', '/fulfillment/packages/hand-over', 200, {
        handedOver: [],
        failed: [{ packageId: 'pkg-1015', code: 'version_conflict', detail: 'vừa được cập nhật' }],
      });
      cy.findByRole('button', { name: 'Bàn giao (1)' }).click();
      cy.findByRole('alertdialog').findByRole('button', { name: 'Bàn giao' }).click();
      cy.contains('1 kiện chưa bàn giao được');
      cy.dong('pkg-1015').should('contain', 'Kiện vừa được cập nhật');
      cy.findByRole('button', { name: 'Bàn giao (1)' }).should('exist');
    });

    it('kiện đơn sàn đã đóng gói mở lại về Đã giữ hàng', () => {
      cy.findByRole('tab', { name: /Đã đóng gói/ }).click();
      cy.get('tbody tr[data-row-id]').first().click();
      trangThaiKien().should('contain', 'Đã đóng gói');
      nutKien('Mở kiện').click();
      cy.findByRole('alertdialog').within(() => {
        cy.contains('Kiện về Đã giữ hàng');
        cy.findByRole('button', { name: 'Mở kiện' }).click();
      });
      trangThaiKien().should('contain', 'Đã giữ hàng');
    });

    it('báo thất lạc chờ người thứ hai xác nhận', () => {
      cy.findByRole('tab', { name: /Đang giao/ }).click();
      cy.dong('pkg-1016').click();
      nutKien('Báo thất lạc').click();
      cy.findByRole('dialog').within(() => {
        cy.findByRole('button', { name: 'Xác nhận' }).click();
        cy.contains('Nhập mã khiếu nại');
        cy.findByLabelText('Mã khiếu nại với đơn vị vận chuyển').type('KN-001');
        cy.findByRole('button', { name: 'Xác nhận' }).click();
      });
      cy.toast(/Đã báo thất lạc KH-\d+, chờ người khác xác nhận/);
      cy.contains('mã khiếu nại KN-001. Cần người khác xác nhận.');
      trangThaiKien().should('contain', 'Báo thất lạc');
      // Người báo không tự xác nhận được: không còn nút nào
      cy.findByRole('button', { name: 'Báo thất lạc' }).should('not.exist');
      cy.findByRole('button', { name: 'Xác nhận thất lạc' }).should('not.exist');
    });

    it('kiện không có thì báo không tìm thấy', () => {
      cy.visit('/c/cmp-001/fulfillment/packages/pkg-999');
      cy.contains('Không tìm thấy kiện');
    });
  });

  context('chia kiện (sơ đồ D2)', () => {
    it('chia kiện hai món thành hai kiện', () => {
      cy.dangNhap('ceo@commerio.vn', 'ceo');
      cy.visit('/c/cmp-001/sales/orders/ord-1010');
      cy.get('[data-testid=order-packages] tbody tr').should('have.length', 1);
      kienCuaDon().findByRole('button', { name: 'Chia kiện' }).click();
      cy.findByRole('dialog').within(() => {
        cy.findByRole('button', { name: 'Chia kiện' }).should('be.disabled');
        cy.get('[data-testid=split-lines] tbody tr').first().find('input').clear().type('1');
        cy.findByRole('button', { name: 'Chia kiện' }).click();
      });
      cy.toast(/Đã chia kiện KH-/);
      cy.get('[data-testid=order-packages] tbody tr').should('have.length', 2);
      cy.get('[data-testid=order-packages]').findAllByRole('button', { name: 'Chia kiện' }).should('not.exist');
    });

    it('sale không có quyền kho thì không thấy nút chia kiện', () => {
      cy.dangNhap('sale@commerio.vn', 'sale');
      cy.visit('/c/cmp-001/sales/orders/ord-1010');
      kienCuaDon().should('contain', 'KH-000010');
      kienCuaDon().find('a').should('not.exist');
      cy.findByRole('button', { name: 'Chia kiện' }).should('not.exist');
    });
  });

  context('cập nhật giao theo kiện (sơ đồ D2)', () => {
    beforeEach(() => cy.dangNhap('sale@commerio.vn', 'sale'));

    it('kiện đang giao sang đã giao, đơn chờ hết hạn trả hàng', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1016');
      kienCuaDon().findByRole('button', { name: 'Cập nhật giao' }).click();
      cy.findByRole('dialog').within(() => {
        cy.findByLabelText('Giao lại').should('not.exist');
        cy.findByLabelText('Hoàn về').should('exist');
        cy.findByLabelText('Đã giao').click();
        cy.findByLabelText('Lý do').should('not.exist');
        cy.findByRole('button', { name: 'Lưu' }).click();
      });
      cy.toast('Đã cập nhật kiện KH-000017: Đã giao');
      kienCuaDon().should('contain', 'Đã giao');
      kienCuaDon().findByRole('button', { name: 'Cập nhật giao' }).should('not.exist');
      cy.get('[data-testid=order-status]').should('contain', 'Chờ hoàn tất');
      cy.contains('Chưa hoàn tất:');
    });

    it('tự giao thất bại: bắt lý do, sau đó giao lại', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1017');
      kienCuaDon().should('contain', 'Đang tự giao');
      kienCuaDon().findByRole('button', { name: 'Cập nhật giao' }).click();
      cy.findByRole('dialog').within(() => {
        cy.findByLabelText('Giao thất bại').click();
        cy.findByRole('button', { name: 'Lưu' }).click();
        cy.contains('Nhập lý do giao không thành công');
        cy.findByLabelText('Lý do').type('Khách không nghe máy');
        cy.findByRole('button', { name: 'Lưu' }).click();
      });
      cy.toast('Đã cập nhật kiện KH-000018: Giao thất bại');
      kienCuaDon().should('contain', 'Giao thất bại');
      cy.get('[data-testid=order-status]').should('contain', 'Giao thất bại');

      kienCuaDon().findByRole('button', { name: 'Cập nhật giao' }).click();
      cy.findByRole('dialog').within(() => {
        cy.findByLabelText('Giao lại').click();
        cy.findByRole('button', { name: 'Lưu' }).click();
      });
      cy.toast('Đã cập nhật kiện KH-000018: Giao lại');
      kienCuaDon().should('contain', 'Đang tự giao');
    });

    it('kiện đơn sàn không có nút cập nhật', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1002');
      cy.get('[data-testid=order-packages]').should('exist');
      cy.findByRole('button', { name: 'Cập nhật giao' }).should('not.exist');
    });
  });

  context('phân quyền (AC-R1)', () => {
    it('kho thấy Kiện hàng, không thấy Đơn hàng', () => {
      cy.dangNhap('kho@commerio.vn', 'kho');
      menuThanhBen('Kiện hàng').should('exist');
      menuThanhBen('Đơn hàng').should('not.exist');
    });

    for (const [email, password] of [
      ['sale@commerio.vn', 'sale'],
      ['admin@commerio.vn', 'admin'],
    ]) {
      it(`${password} không thấy Kiện hàng, mở URL thì bị chặn`, () => {
        cy.dangNhap(email, password);
        menuThanhBen('Kiện hàng').should('not.exist');
        cy.visit('/c/cmp-001/fulfillment/packages');
        cy.contains(CHAN_QUYEN);
        cy.visit('/c/cmp-001/fulfillment/packages/pkg-1006');
        cy.contains(CHAN_QUYEN);
      });
    }

    it('ceo thấy cả Đơn hàng và Kiện hàng', () => {
      cy.dangNhap('ceo@commerio.vn', 'ceo');
      menuThanhBen('Đơn hàng').should('exist');
      menuThanhBen('Kiện hàng').should('exist');
    });
  });
});
