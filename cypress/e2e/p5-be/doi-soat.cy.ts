// P5 với BE thật · Đối soát tiền sàn và báo cáo kinh doanh (FE#13; commerio-backend#29, #30). Dựng dữ liệu trước mỗi lần chạy
// bằng cypress/be-seed/doi-soat.mts (xem đầu file đó), ghi ra cypress/fixtures/fe13-be.json.
// Năm đơn sàn có hoá đơn hôm nay: 100.000 khớp, 200.000 sàn đã hoàn, 150.000 lệch doanh thu, 80.000 ở bảng kê chưa trả,
// 120.000 chưa đối soát. Mỗi dòng đơn phí 17.000, vận chuyển 15.000, tiền về = doanh thu sàn − 32.000.

interface Don {
  orderId: string;
  code: string;
  externalOrderId: string;
  total: number;
}
interface Seed {
  email: string;
  analyst: string;
  password: string;
  companyId: string;
  shopId: string;
  shopName: string;
  today: string;
  orders: Record<'matched' | 'refunded' | 'mismatch' | 'processing' | 'unsettled', Don>;
  tx: Record<'matched' | 'notFound' | 'refunded' | 'mismatch' | 'processing', string>;
  statements: Record<'paid' | 'processing', { id: string; code: string }>;
}

let s: Seed;
const url = (p: string) => `/c/${s.companyId}${p}`;
const dongCo = (text: string) => cy.contains('tbody tr[data-row-id]', text);
const the = (label: string) => cy.contains('[data-figure]', label);
/** Số tiền như formatCurrency: dấu chấm nghìn, khoảng trắng bất kỳ trước ₫ */
const tien = (n: number) => new RegExp(`${n < 0 ? '-' : ''}${Math.abs(n).toLocaleString('de-DE')}\\s₫`);
const dmy = (d: string) => d.split('-').reverse().join('/');

function dangNhap(email: string) {
  cy.visit('/login');
  cy.get('input[name=email]').type(email);
  cy.get('input[name=password]').type(s.password, { log: false });
  cy.findByRole('button', { name: 'Đăng nhập' }).click();
  cy.location('pathname').should('match', new RegExp(`^/c/${s.companyId}`));
}

before(() => cy.fixture('fe13-be.json').then((d: Seed) => (s = d)));

describe('P5-BE · Đối soát sàn', () => {
  beforeEach(() => dangNhap(s.email));

  it('danh sách bảng kê: mới nhất trước, số đếm, tiền về, phiếu thu đã sinh', () => {
    cy.menu('Đối soát sàn');
    cy.get('tbody tr[data-row-id]').should('have.length', 2);
    cy.get('tbody tr[data-row-id]').first().should('have.attr', 'data-row-id', s.statements.processing.id);
    cy.dong(s.statements.processing.id)
      .should('contain', s.statements.processing.code)
      .and('contain', `${s.shopName} (TikTok Shop)`)
      .and('contain', 'Đang xử lý');
    cy.dong(s.statements.paid.id).should('contain', 'Đã trả').and('contain.text', '372.000').and('contain.text', '186.000');
    cy.dong(s.statements.paid.id).find('[data-warn]').should('have.text', '2');

    cy.chon('Trạng thái trả', 'Đã trả');
    cy.get('tbody tr[data-row-id]').should('have.length', 1);
    cy.dong(s.statements.paid.id).click();
    cy.location('pathname').should('eq', url(`/finance/settlements/${s.statements.paid.id}`));
  });

  it('chi tiết bảng kê đã trả: kết quả khớp từng dòng, phiếu thu, công thức', () => {
    cy.visit(url(`/finance/settlements/${s.statements.paid.id}`));
    cy.contains('h1', `Bảng kê ${s.statements.paid.code}`);
    cy.contains('Khớp 1');
    cy.contains('Chênh lệch 2');
    cy.contains('Sàn đã hoàn 1');

    dongCo(s.tx.matched).should('contain', s.orders.matched.code).and('contain', 'Khớp').contains('a', /^PT-/);
    dongCo(s.tx.refunded).should('contain', s.orders.refunded.code).and('contain', 'Sàn đã hoàn').and('contain', 'PT-');
    dongCo(s.tx.mismatch).should('contain', 'Lệch doanh thu').and('not.contain', 'PT-');
    dongCo(s.tx.notFound).should('contain', 'Không có trong hệ thống').and('contain', 'Không tìm thấy đơn');

    dongCo(s.tx.mismatch).findByRole('button', { name: 'Mở rộng' }).click();
    cy.get('[data-testid=line-breakdown]')
      .should('contain', 'Hoa hồng')
      .and('contain', 'Doanh thu − Phí − Vận chuyển + Điều chỉnh')
      .contains(/Doanh thu sàn 140\.000\s₫, tổng đơn 150\.000\s₫, lệch 10\.000\s₫/);
    cy.get('[data-testid=line-breakdown] .text-destructive').should('not.exist');

    // Phiếu thu sinh từ dòng khớp mở được
    dongCo(s.tx.matched).contains('a', /^PT-/).click();
    cy.location('pathname').should('match', new RegExp(`^/c/${s.companyId}/finance/receipts/`));
    cy.contains(/68\.000\s₫/);
  });

  it('bảng kê chưa trả: phiếu thu chờ sàn trả', () => {
    cy.visit(url(`/finance/settlements/${s.statements.processing.id}`));
    dongCo(s.tx.processing).should('contain', 'Khớp').and('contain', 'Chờ sàn trả');
  });

  it('tab Chênh lệch: hai dòng, link về bảng kê theo mã sàn', () => {
    cy.visit(url('/finance/settlements?tab=discrepancies'));
    cy.get('tbody tr[data-row-id]').should('have.length', 2);
    cy.chon('Lý do', 'Không tìm thấy đơn');
    cy.get('tbody tr[data-row-id]').should('have.length', 1);
    dongCo(s.tx.notFound).findByRole('link', { name: s.statements.paid.code }).click();
    cy.location('pathname').should('eq', url(`/finance/settlements/${s.statements.paid.id}`));
  });

  // Nhãn đối soát ở chi tiết đơn chỉ thử bằng mock: BE chưa có GET /sales/orders/:id (#24, #25)

  it('BE chưa có đối soát ngay: không hiện nút', () => {
    cy.visit(url('/finance/settlements'));
    cy.dong(s.statements.paid.id);
    cy.findByRole('button', { name: 'Đối soát ngay' }).should('not.exist');
  });
});

describe('P5-BE · Báo cáo kinh doanh', () => {
  // Doanh thu 650.000; tiền đã thu = phiếu thu khớp 68.000 + hoàn 118.000; phí sàn 4 × 17.000; vận chuyển 4 × 15.000; chưa có giá vốn
  const SO = { revenue: 650000, cash: 186000, platformFee: 68000, shipping: 60000, cogs: 0, profit: 522000 };

  it('CEO: thẻ số đúng tính tay, cảnh báo đơn chưa đối soát, bảng gian hàng', () => {
    dangNhap(s.email);
    cy.menu('Báo cáo kinh doanh');
    the('Doanh thu').contains(tien(SO.revenue));
    the('Tiền đã thu').contains(tien(SO.cash));
    the('Phí sàn').contains(tien(SO.platformFee));
    the('Phí cổng').contains(tien(0));
    the('Phí vận chuyển').contains(tien(SO.shipping));
    the('Giá vốn').contains(tien(SO.cogs));
    the('Lãi').contains(tien(SO.profit));
    cy.contains(/Số liệu tính lúc \d{2}:\d{2} \d{2}\/\d{2}\/\d{4}/);
    cy.contains('[role=status]', 'Có đơn sàn chưa đối soát').findByRole('link', { name: 'Xem đối soát sàn' });

    cy.findByRole('table', { name: 'Lãi theo gian hàng' }).within(() => {
      cy.contains('tbody tr', s.shopName).should('contain', 'TikTok Shop').and('contain', '80,3%');
      cy.contains('tbody tr', s.shopName).findByLabelText('Phí sàn chưa đối soát');
      cy.get('tfoot tr').should('contain', 'Tổng').contains(tien(SO.profit));
    });
    cy.get('[data-testid=daily-chart] .recharts-line').should('have.length', 3);

    cy.visit(url(`/reports?from=${s.today}&to=${s.today}`));
    cy.contains(`${dmy(s.today)} – ${dmy(s.today)}`);
    the('Doanh thu').contains(tien(SO.revenue));
  });

  it('CEO: xuất CSV lãi theo gian hàng từ BE, có BOM và dòng Tổng', () => {
    dangNhap(s.email);
    cy.visit(url(`/reports?from=${s.today}&to=${s.today}`));
    cy.findByRole('button', { name: 'Xuất CSV' }).click();
    cy.findByRole('menuitem', { name: 'Lãi theo gian hàng' }).click();
    cy.contains('[data-sonner-toast]', 'Đã xuất báo cáo');
    cy.readFile(`cypress/downloads/bao-cao-shops-${s.today}-${s.today}.csv`, null).then((buf: Uint8Array) => {
      expect([buf[0], buf[1], buf[2]]).to.deep.equal([0xef, 0xbb, 0xbf]);
      const text = new TextDecoder().decode(buf);
      expect(text).to.contain(s.shopName);
      expect(text).to.contain('522000');
      expect(text.trim().split('\r\n').pop()).to.match(/^Tổng/);
    });
  });

  it('Phân tích: không có giá vốn, lãi, nút xuất; BE trả null nên FE ẩn', () => {
    dangNhap(s.analyst);
    cy.menu('Báo cáo kinh doanh');
    the('Doanh thu').contains(tien(SO.revenue));
    cy.get('[data-figure=cogs], [data-figure=profit]').should('not.exist');
    cy.findByRole('table', { name: 'Lãi theo gian hàng' }).find('th').should('not.contain', 'Lãi');
    cy.findByRole('button', { name: 'Xuất CSV' }).should('not.exist');
  });
});
