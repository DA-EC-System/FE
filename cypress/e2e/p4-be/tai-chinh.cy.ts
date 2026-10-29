// P4 với BE thật · Tài chính (FE#12; commerio-backend#25, #27). BE chưa có API tạo đơn nên dựng dữ liệu trước mỗi lần chạy
// bằng cypress/be-seed/tai-chinh.mts (xem đầu file đó), ghi ra cypress/fixtures/fe12-be.json.
// Các test chạy theo thứ tự, test sau dùng trạng thái test trước để lại.

interface Don {
  orderId: string;
  code: string;
  amount: number;
}
interface Seed {
  run: string;
  email: string;
  password: string;
  companyId: string;
  cod: Don[];
  codNotCollected: Don;
  refund: Don[];
  paid: Don;
  invoice: { id: string; number: string };
  mismatch: Don;
  assignTarget: Don;
}

let s: Seed;
const tab = (name: string) => cy.findByRole('tab', { name: new RegExp(`^${name}`) });
const hopGan = () => cy.contains('[role=dialog]', 'Gán vào đơn');
const hopHoanLai = () => cy.contains('[role=dialog]', 'Hoàn lại khoản thu');
const dongCo = (text: string) => cy.contains('tbody tr[data-row-id]', text);
const url = (p: string) => `/c/${s.companyId}${p}`;

before(() => cy.fixture('fe12-be.json').then((d: Seed) => (s = d)));
beforeEach(() => {
  cy.visit('/login');
  cy.get('input[name=email]').type(s.email);
  cy.get('input[name=password]').type(s.password, { log: false });
  cy.findByRole('button', { name: 'Đăng nhập' }).click();
  cy.location('pathname').should('match', new RegExp(`^/c/${s.companyId}`));
});

describe('P4-BE · Tài chính', () => {
  it('chứng từ: hoá đơn, chi tiết dòng hàng; phiếu thu cổng mở được giao dịch gốc', () => {
    cy.menu('Chứng từ');
    tab('Hoá đơn').should('have.attr', 'aria-selected', 'true');
    cy.dong(s.invoice.id).should('contain', s.invoice.number).and('contain', s.paid.code).click();
    cy.location('pathname').should('eq', url(`/finance/invoices/${s.invoice.id}`));
    cy.get('[data-testid=invoice-lines]').find('tbody tr').should('have.length', 1);
    cy.get('[data-testid=invoice-totals]').should('contain', '99.000');

    cy.visit(url('/finance/documents?tab=receipts'));
    dongCo(s.paid.code).contains('td', /^PT-/).click();
    cy.get('[data-testid=receipt-origin]').findByRole('button', { name: 'Xem giao dịch cổng' }).click();
    cy.findByRole('dialog').within(() => {
      cy.get('[data-testid=txn-fields]').should('contain', 'VietQR');
      cy.get('[data-testid=txn-payload]').should('contain', '"simulated": true');
    });
  });

  it('hoá đơn không có báo 404', () => {
    cy.visit(url('/finance/invoices/00000000-0000-4000-8000-000000000000'));
    cy.contains('Không tìm thấy hoá đơn. Hoá đơn không tồn tại hoặc không thuộc công ty này.');
  });

  it('thu COD: chờ thu có hai đơn đã giao, không thu có đơn huỷ; xác nhận lô sinh phiếu thu', () => {
    cy.menu('Thu COD');
    cy.get('tbody tr[data-row-id]').should('have.length', 2);
    cy.dong(s.cod[0].orderId).should('contain', '200.000');
    tab('Không thu').click();
    cy.dong(s.codNotCollected.orderId).should('contain', '—');
    tab('Chờ thu').click();
    cy.findByRole('checkbox', { name: 'Chọn cả trang' }).click();
    cy.get('[data-testid=cod-total]').should('contain', '550.000');
    cy.findByRole('button', { name: 'Xác nhận đã nhận tiền (2)' }).click();
    cy.findByRole('alertdialog').findByRole('button', { name: 'Xác nhận' }).click();
    cy.toast(/^Đã xác nhận 2 đơn COD, lập phiếu thu PT-/);
    cy.contains('Chưa có đơn COD');
    tab('Đã thu').click();
    cy.dong(s.cod[0].orderId).find('a').should('contain', 'PT-');
    cy.dong(s.cod[1].orderId).find('a').should('contain', 'PT-');
  });

  it('hoàn tiền một bước: phiếu chi, sang tab Đã hoàn', () => {
    const d = s.refund[0];
    cy.menu('Hoàn tiền');
    cy.dong(d.orderId).should('contain', 'VietQR').findByRole('button', { name: 'Hoàn tiền' }).click();
    cy.findByRole('dialog').within(() => {
      cy.get('[data-testid=refund-summary]').should('contain', d.code).and('contain', '180.000');
      cy.findByLabelText('Ghi chú').type('Hoàn E2E');
      cy.findByRole('button', { name: 'Hoàn tiền' }).click();
    });
    cy.toast(new RegExp(`^Đã hoàn 180\\.000\\s₫ cho đơn ${d.code}, phiếu chi PC-`));
    cy.dong(d.orderId).should('not.exist');
    tab('Đã hoàn').click();
    cy.dong(d.orderId).should('contain', 'PC-');
  });

  it('phiếu chi nháp rồi ghi sổ: đơn chờ hoàn sang Đã hoàn', () => {
    const d = s.refund[1];
    cy.visit(url('/finance/documents?tab=vouchers'));
    cy.findByRole('button', { name: 'Lập phiếu chi' }).click();
    cy.findByRole('dialog').within(() => {
      cy.chon('Mục đích', 'Hoàn tiền khách');
      cy.get('#voucher-source').type(d.code);
    });
    cy.findByRole('option', { name: new RegExp(d.code) }).click();
    cy.findByRole('dialog').within(() => {
      cy.get('#voucher-amount').should('be.disabled').invoke('val').should('match', /260\.000/);
      cy.findByRole('button', { name: 'Lưu nháp' }).click();
    });
    cy.toast(/^Đã lập phiếu chi nháp PC-/);
    cy.location('pathname').should('match', /\/finance\/payment-vouchers\/[0-9a-f-]{36}$/);
    cy.get('[data-testid=doc-status]').should('contain', 'Nháp');
    cy.findByRole('button', { name: 'Ghi sổ' }).click();
    cy.findByRole('alertdialog').should('contain', '260.000').findByRole('button', { name: 'Ghi sổ' }).click();
    cy.toast(/^Đã ghi sổ phiếu chi PC-/);
    cy.get('[data-testid=doc-status]').should('contain', 'Đã ghi sổ');
    cy.findByRole('button', { name: /^(Sửa|Xoá|Ghi sổ)$/ }).should('not.exist');

    cy.menu('Hoàn tiền');
    cy.contains('Chưa có đơn chờ hoàn');
    tab('Đã hoàn').click();
    cy.dong(d.orderId).should('contain', 'PC-');
  });

  it('khoản thu chưa khớp: lệch tiền khoá nút Gán; gán khoản khớp tiền; hoàn lại khoản còn lại', () => {
    cy.menu('Khoản thu chưa khớp');
    cy.get('tbody tr[data-row-id]').should('have.length', 3);
    dongCo('149.000').should('contain', 'Lệch số tiền').and('contain', s.mismatch.code).findByRole('button', { name: 'Gán vào đơn' }).click();
    hopGan().within(() => {
      cy.get('[data-testid=assign-order]').should('contain', s.mismatch.code).and('contain', 'Lệch');
      cy.findByRole('button', { name: 'Gán' }).should('be.disabled');
      cy.findByRole('button', { name: 'Đóng' }).click();
    });

    dongCo(`CK GAN ${s.run}`).findByRole('button', { name: 'Gán vào đơn' }).click();
    hopGan().find('#assign-order').type(s.assignTarget.code);
    cy.findByRole('option', { name: new RegExp(s.assignTarget.code) }).click();
    hopGan().within(() => {
      cy.get('[data-testid=assign-order]').should('contain', s.assignTarget.code).and('not.contain', 'Lệch');
      cy.findByRole('button', { name: 'Gán' }).click();
    });
    cy.toast(new RegExp(`^Đã gán vào đơn ${s.assignTarget.code}, phiếu thu PT-`));

    dongCo(`CK HOAN ${s.run}`).findByRole('button', { name: 'Hoàn lại' }).click();
    hopHoanLai().within(() => {
      cy.contains('50.000');
      cy.findByRole('button', { name: 'Hoàn lại' }).click();
    });
    cy.toast(/^Đã hoàn lại 50\.000\s₫, phiếu chi PC-/);
    cy.get('tbody tr[data-row-id]').should('have.length', 1);

    tab('Đã gán').click();
    dongCo(`CK GAN ${s.run}`).should('contain', s.assignTarget.code).and('contain', 'PT-');
    tab('Đã hoàn lại').click();
    dongCo(`CK HOAN ${s.run}`).should('contain', 'PC-');
  });

  it('giao dịch cổng: giao dịch cần xem lại có link khoản thu chưa khớp; panel chi tiết chỉ xem', () => {
    cy.menu('Giao dịch cổng');
    dongCo('149.000').should('contain', 'Cần xem lại').find('a').should('contain', 'Xem khoản thu chưa khớp');
    dongCo('99.000').should('contain', 'PT-').click();
    cy.location('search').should('contain', 'txn=');
    cy.findByRole('dialog').within(() => {
      cy.get('[data-testid=txn-fields]').should('contain', 'VietQR');
      cy.get('[data-testid=txn-payload]').should('contain', '"simulated": true');
      cy.findAllByRole('button').each(($b) => expect($b.text()).not.to.match(/Gán|Hoàn|Xoá|Sửa|Ghi sổ/));
    });
  });
});
