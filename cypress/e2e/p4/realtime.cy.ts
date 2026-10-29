// P4 · Realtime (FE#81): màn hình tự cập nhật khi sàn đẩy sự kiện, không bấm tải lại.
// Sự kiện phát bằng cy.phatSuKienSan (không qua trang sàn giả lập, vì trang đó tự làm mới mọi query).

const realtime = () => cy.get('[data-testid=realtime-status]');

describe('P4 · Realtime', () => {
  beforeEach(() => {
    cy.dangNhap('sale@commerio.vn', 'sale');
    cy.visit('/c/cmp-001/sales/orders');
    realtime().should('have.attr', 'data-status', 'open');
  });

  it('đơn mới từ sàn tự hiện trên danh sách đang mở, có thông báo', () => {
    cy.get('tbody tr').should('have.length.greaterThan', 0);
    cy.phatSuKienSan('order.created', 'shp-001').then((message) => {
      const code = message.split(':')[0]!;
      cy.contains('tbody tr', code).should('exist');
      cy.toast(`Có đơn mới ${code}`);
    });
  });

  it('bấm Xem trên thông báo mở đơn; khách trả tiền thì chi tiết tự đổi trạng thái', () => {
    cy.phatSuKienSan('order.created', 'shp-001').then((message) => {
      const code = message.split(':')[0]!;
      cy.toast(`Có đơn mới ${code}`).findByRole('button', { name: 'Xem' }).click();
      cy.location('pathname').should('match', /\/sales\/orders\/ord-/);
      cy.get('[data-testid=order-status]').should('contain', 'Chưa thanh toán');

      cy.phatSuKienSan('order.paid', undefined, { code });
      cy.get('[data-testid=order-status]').should('contain', 'Đang xử lý');
    });
  });
});
