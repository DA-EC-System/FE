// P4 · Yêu cầu trả (sơ đồ D3; FE#60): xử lý yêu cầu, quét nhận hàng trả, kiểm hàng về đóng yêu cầu, sàn đẩy về

const CHAN_QUYEN = 'Vai trò của bạn trong công ty này không có quyền mở trang này.';

const trangThai = () => cy.get('[data-testid=return-status]');
const nut = (name: string) => cy.get('[data-testid=return-actions]').findByRole('button', { name });
const tien = () => cy.get('[data-testid=return-money]');

const diToi = (path: string) =>
  cy.window().then((win) => {
    win.history.pushState({}, '', path);
    win.dispatchEvent(new PopStateEvent('popstate'));
  });

/** Sàn giả lập: điền tham số rồi phát sự kiện */
const phat = (type: string, value: string) => {
  cy.get(`[data-event="${type}"]`).within(() => {
    cy.findByRole('textbox').clear().type(value);
    cy.findByRole('button', { name: 'Phát' }).click();
  });
};

/** Sàn đẩy yêu cầu trả cho DH-1015 rồi mở chi tiết YCT-000003 */
const yeuCauSan = () => {
  cy.visit('/c/cmp-001/dev/marketplace');
  phat('return.requested', 'DH-1015');
  cy.toast(/YCT-000003 cho DH-1015/);
  diToi('/c/cmp-001/sales/returns');
  cy.contains('tr', 'YCT-000003').click();
  trangThai().should('contain', 'Chờ xử lý');
};

const quetNhan = (code: string) => {
  cy.findByRole('button', { name: 'Quét nhận hàng trả' }).click();
  cy.findByRole('dialog').within(() => {
    cy.findByTestId('receive-code').type(code);
    cy.findByRole('button', { name: 'Nhận hàng' }).click();
  });
};

describe('P4 · Yêu cầu trả', () => {
  context('Sale xử lý yêu cầu', () => {
    beforeEach(() => cy.dangNhap('sale@commerio.vn', 'sale'));

    it('danh sách mở tab Chờ xử lý, đơn mang cờ Có yêu cầu trả', () => {
      cy.menu('Yêu cầu trả');
      cy.findByRole('tab', { name: /Chờ xử lý/ }).should('have.attr', 'aria-selected', 'true');
      cy.dong('rr-001').should('contain', 'YCT-000001').and('contain', 'DH-1020');
      cy.dong('rr-002').should('not.exist');
      cy.findByRole('tab', { name: /Chờ hàng về/ }).click();
      cy.dong('rr-002').should('contain', 'DH-1019');
      // Sale không có quyền kho nên không thấy nút quét
      cy.findByRole('button', { name: 'Quét nhận hàng trả' }).should('not.exist');
      cy.visit('/c/cmp-001/sales/orders/ord-1020');
      cy.get('[data-testid=order-returns]').should('contain', 'YCT-000001');
      cy.get('main').should('contain', 'Có yêu cầu trả');
    });

    it('chấp nhận trả hàng: chờ hàng về, không có nút nhận hàng khi thiếu quyền kho', () => {
      cy.visit('/c/cmp-001/sales/returns/rr-001');
      trangThai().should('contain', 'Chờ xử lý');
      nut('Chấp nhận trả hàng').click();
      cy.findByRole('alertdialog').findByRole('button', { name: 'Chấp nhận trả hàng' }).click();
      cy.toast('YCT-000001: Chấp nhận trả hàng');
      trangThai().should('contain', 'Chờ hàng về');
      cy.get('[data-testid=return-actions]').should('contain', 'Khách không gửi hàng').and('not.contain', 'Nhận hàng trả');
      // Yêu cầu lập tay không có lịch sử phía sàn
      cy.findByRole('tab', { name: 'Lịch sử phía sàn' }).should('not.exist');
    });

    it('từ chối bắt buộc lý do; yêu cầu lập tay không có sàn xử cho khách', () => {
      cy.visit('/c/cmp-001/sales/returns/rr-001');
      nut('Từ chối').click();
      cy.findByRole('dialog').within(() => {
        cy.findByRole('button', { name: 'Xác nhận' }).click();
        cy.contains('Nhập lý do');
        cy.findByLabelText('Lý do').type('Quá hạn đổi trả');
        cy.findByRole('button', { name: 'Xác nhận' }).click();
      });
      trangThai().should('contain', 'Đã từ chối');
      cy.get('[data-testid=return-actions]').should('not.exist');
      cy.get('[data-testid=status-history]').should('contain', 'Quá hạn đổi trả');
    });

    it('hoàn tiền, khách giữ hàng: đóng luồng, ghi tiền hoàn', () => {
      cy.visit('/c/cmp-001/sales/returns/rr-001');
      nut('Hoàn tiền, khách giữ hàng').click();
      cy.findByRole('alertdialog').findByRole('button', { name: 'Hoàn tiền, khách giữ hàng' }).click();
      trangThai().should('contain', 'Chỉ hoàn tiền');
      tien().should('contain', '180.000').and('contain', 'Đã hoàn');
    });

    it('khách không gửi hàng: đóng, không hoàn tiền', () => {
      cy.visit('/c/cmp-001/sales/returns/rr-002');
      nut('Khách không gửi hàng').click();
      cy.findByRole('dialog').within(() => {
        cy.findByLabelText('Lý do').type('Quá 14 ngày không gửi');
        cy.findByRole('button', { name: 'Xác nhận' }).click();
      });
      trangThai().should('contain', 'Đã đóng').and('contain', 'Khách không gửi');
      tien().should('contain', 'Chưa hoàn');
    });

    it('lập yêu cầu trả một phần cho đơn tạo tay, vượt số thì báo tại ô', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1021');
      cy.get('[data-testid=order-returns]').findByRole('button', { name: 'Tạo yêu cầu trả' }).click();
      cy.findByRole('dialog').within(() => {
        cy.findByRole('button', { name: 'Lập yêu cầu' }).click();
        cy.contains('Chọn ít nhất một dòng trả');
        cy.get('[data-testid=create-return-lines] tbody tr')
          .first()
          .within(() => {
            cy.get('td').eq(2).invoke('text').as('conTra');
          });
      });
      cy.get<string>('@conTra').then((t) => {
        const n = Number(t);
        cy.get('[data-testid=create-return-lines] tbody tr').first().find('input').clear().type(String(n + 1));
        cy.findByRole('button', { name: 'Lập yêu cầu' }).click();
        cy.findByRole('dialog').should('contain', `Còn trả được ${n}`);
        cy.get('[data-testid=create-return-lines] tbody tr').first().find('input').clear().type('1');
      });
      cy.findByRole('dialog').within(() => {
        cy.findByRole('button', { name: 'Lập yêu cầu' }).click();
        cy.contains('Nhập lý do');
        cy.findByTestId('return-reason').type('Khách đổi size');
        cy.findByRole('button', { name: 'Lập yêu cầu' }).click();
      });
      cy.toast('Đã lập yêu cầu trả YCT-000003');
      cy.get('[data-testid=order-returns]').should('contain', 'YCT-000003').and('contain', 'Chờ xử lý');
      cy.get('main').should('contain', 'Có yêu cầu trả');
    });

    it('đơn sàn không lập tay được yêu cầu trả', () => {
      cy.visit('/c/cmp-001/sales/orders/ord-1015');
      cy.findByRole('button', { name: 'Tạo yêu cầu trả' }).should('not.exist');
    });
  });

  context('kho quét nhận hàng trả', () => {
    beforeEach(() => cy.dangNhap('ceo@commerio.vn', 'ceo'));

    it('quét khớp: nhận hàng, ghi sổ kiểm hàng về thì yêu cầu đóng', () => {
      cy.visit('/c/cmp-001/sales/returns');
      quetNhan('YCT-000002');
      cy.toast('Đã nhận hàng trả YCT-000002');
      trangThai().should('contain', 'Đã nhận hàng');
      tien().should('contain', 'Chờ kiểm hàng về');
      cy.contains('Phiếu kiểm hàng về').parent().find('a').click();
      cy.findByTestId('doc-lines').within(() => {
        cy.findAllByLabelText(/^Số quét /).first().clear().type('1');
        cy.findAllByLabelText(/^Bán lại /).first().clear().type('1');
      });
      cy.findByRole('button', { name: 'Ghi sổ' }).click();
      cy.findByRole('alertdialog').findByRole('button', { name: 'Ghi sổ' }).click();
      cy.findByTestId('doc-status').should('contain', 'Đã ghi sổ');
      diToi('/c/cmp-001/sales/returns/rr-002');
      trangThai().should('contain', 'Đã đóng').and('contain', 'Đã kiểm hàng về');
      tien().should('contain', 'Số bán lại được').and('contain', '1').and('contain', 'Giảm giá vốn');
    });

    it('quét yêu cầu chưa chấp nhận thì báo lỗi', () => {
      cy.visit('/c/cmp-001/sales/returns');
      quetNhan('YCT-000001');
      cy.findByRole('dialog').should('contain', 'không ở trạng thái Chờ hàng về');
    });

    it('quét không khớp: kiện vào tab Không khớp, gắn vào yêu cầu chờ hàng về', () => {
      cy.visit('/c/cmp-001/sales/returns');
      quetNhan('VD-LA-999');
      cy.toast('Mã VD-LA-999 không khớp yêu cầu nào');
      cy.findByRole('tab', { name: /Không khớp/ }).should('have.attr', 'aria-selected', 'true');
      cy.get('[data-testid=unmatched-parcels] tr[data-row-id="VD-LA-999"]').within(() => {
        cy.contains('Chờ xử lý');
        cy.findByRole('button', { name: 'Gắn yêu cầu' }).click();
      });
      cy.findByRole('dialog').within(() => {
        cy.findByRole('button', { name: 'Gắn và nhận hàng' }).click();
        cy.contains('Chọn yêu cầu trả');
      });
      cy.chon('Yêu cầu đang chờ hàng về', /YCT-000002/);
      cy.findByRole('dialog').findByRole('button', { name: 'Gắn và nhận hàng' }).click();
      cy.toast('Đã gắn kiện VD-LA-999 vào yêu cầu');
      cy.get('[data-testid=unmatched-parcels] tr[data-row-id="VD-LA-999"]').find('a').should('have.text', 'YCT-000002').click();
      trangThai().should('contain', 'Đã nhận hàng');
    });

    it('kiện không khớp xử lý khác thì bắt buộc ghi cách xử lý', () => {
      cy.visit('/c/cmp-001/sales/returns');
      quetNhan('KHONG-RO');
      cy.get('[data-testid=unmatched-parcels] tr[data-row-id="KHONG-RO"]').findByRole('button', { name: 'Xử lý khác' }).click();
      cy.findByRole('dialog').within(() => {
        cy.findByLabelText('Cách xử lý').type('Trả lại đơn vị vận chuyển');
        cy.findByRole('button', { name: 'Xác nhận' }).click();
      });
      cy.get('[data-testid=unmatched-parcels] tr[data-row-id="KHONG-RO"]')
        .should('contain', 'Trả lại đơn vị vận chuyển')
        .findByRole('button')
        .should('not.exist');
    });
  });

  context('sàn đẩy yêu cầu trả', () => {
    beforeEach(() => cy.dangNhap('ceo@commerio.vn', 'ceo'));

    it('sàn đẩy yêu cầu, người bán từ chối, sàn xử cho khách thì mở lại', () => {
      cy.visit('/c/cmp-001/dev/marketplace');
      phat('return.requested', 'DH-1015');
      cy.toast(/YCT-000003 cho DH-1015; .* nhảy sang Đã giao/);
      diToi('/c/cmp-001/sales/returns');
      cy.findByRole('tab', { name: /Chờ xử lý/ }).should('contain', '2');
      cy.contains('tr', 'YCT-000003').should('contain', 'DH-1015').click();
      cy.get('main').should('contain', 'Sàn ·');
      cy.get('[data-testid=platform-status]').should('contain', 'REQUEST_INITIATE');
      nut('Từ chối').click();
      cy.findByRole('dialog').within(() => {
        cy.contains('Từ chối yêu cầu YCT-000003');
        cy.findByLabelText('Quá hạn trả hàng').click();
        cy.findByRole('button', { name: 'Từ chối' }).click();
      });
      cy.toast('YCT-000003: Từ chối');
      trangThai().should('contain', 'Đã từ chối').and('contain', 'Khách đang khiếu nại trên sàn');
      cy.contains('Lý do từ chối (theo sàn)').parent().should('contain', 'Quá hạn trả hàng');
      cy.contains('Sàn xử cho khách thì yêu cầu mở lại');
      nut('Sàn xử cho khách: trả hàng').should('exist');

      diToi('/c/cmp-001/dev/marketplace');
      phat('return.judged', 'YCT-000003 return');
      cy.toast('YCT-000003 → awaiting_return');
      diToi('/c/cmp-001/sales/orders/ord-1015');
      cy.get('[data-testid=order-returns]').should('contain', 'YCT-000003').and('contain', 'Chờ hàng về');
    });

    it('lý do sàn đòi bằng chứng thì bắt buộc ảnh', () => {
      yeuCauSan();
      nut('Từ chối').click();
      cy.findByRole('dialog').within(() => {
        cy.findByRole('button', { name: 'Từ chối' }).click();
        cy.contains('Chọn lý do từ chối');
        cy.findByLabelText(/Hàng bị khách làm hỏng/).click();
        cy.contains('Ảnh bằng chứng (bắt buộc)');
        cy.findByRole('button', { name: 'Từ chối' }).click();
        cy.contains('Lý do này cần ảnh làm bằng chứng');
        cy.findByLabelText('Ghi chú gửi sàn').type('Vỏ hộp móp, có vết bẩn');
        cy.get('[data-testid=attachment-input]').selectFile(
          { contents: Cypress.Buffer.from('anh-bang-chung'), fileName: 'hong.png', mimeType: 'image/png' },
          { force: true },
        );
        cy.get('[data-testid=attachments] li[data-file-id]').should('have.length', 1);
        cy.findByRole('button', { name: 'Từ chối' }).click();
      });
      cy.toast('YCT-000003: Từ chối');
      cy.contains('Lý do từ chối (theo sàn)').parent().should('contain', 'Hàng bị khách làm hỏng');
      cy.contains('Hàng bị khách làm hỏng: Vỏ hộp móp, có vết bẩn');
      cy.contains('Ảnh bằng chứng gửi sàn').parent().find('li[data-file-id]').should('have.length', 1);
    });

    it('lịch sử phía sàn hiện trạng thái gốc, mới nhất trước', () => {
      yeuCauSan();
      nut('Chấp nhận trả hàng').click();
      cy.findByRole('alertdialog').findByRole('button', { name: 'Chấp nhận trả hàng' }).click();
      trangThai().should('contain', 'Chờ hàng về');
      cy.findByRole('tab', { name: 'Lịch sử phía sàn' }).click();
      cy.get('[data-testid=platform-history] tbody tr').should('have.length', 2);
      cy.get('[data-testid=platform-history] tbody tr')
        .first()
        .should('contain', 'RETURN_PENDING')
        .and('contain', 'SELLER_AGREE_RETURN')
        .and('contain', 'agreeReturn');
      cy.get('[data-testid=platform-history] tbody tr').last().should('contain', 'REQUEST_INITIATE');
    });

    it('đơn tạo tay không nhận yêu cầu từ sàn', () => {
      cy.visit('/c/cmp-001/dev/marketplace');
      phat('return.requested', 'DH-1021');
      cy.toast('Chỉ đơn sàn');
    });
  });

  context('phân quyền', () => {
    it('kho xem được, quét được, không có nút xử lý yêu cầu', () => {
      cy.dangNhap('kho@commerio.vn', 'kho');
      cy.menu('Yêu cầu trả');
      cy.findByRole('button', { name: 'Quét nhận hàng trả' }).should('exist');
      cy.dong('rr-001').click();
      trangThai().should('contain', 'Chờ xử lý');
      cy.get('[data-testid=return-actions]').should('not.exist');
      tien().should('not.contain', 'Giảm giá vốn');
    });

    it('kế toán không mở được trang yêu cầu trả', () => {
      cy.dangNhap('ketoan@commerio.vn', 'ketoan');
      cy.visit('/c/cmp-001/sales/returns');
      cy.contains(CHAN_QUYEN);
    });
  });
});
