// P5 · Báo cáo kinh doanh: thẻ số, biểu đồ theo ngày, lãi theo gian hàng, xuất CSV (UC-RP-01, UC-RP-02; FE#13)

const CHAN_QUYEN = 'Vai trò của bạn trong công ty này không có quyền mở trang này.';
const KHONG_QUYEN_THAO_TAC = 'Bạn không có quyền thực hiện thao tác này';
const BAO_CAO = '/c/cmp-001/reports';

const DAY_MS = 86_400_000;
/** Ngày giờ VN cách hôm nay `n` ngày, yyyy-mm-dd như mock */
const vnDay = (n = 0) => new Date(Date.now() + 7 * 3600_000 + n * DAY_MS).toISOString().slice(0, 10);
const dmy = (d: string) => d.split('-').reverse().join('/');

const phantich = () => cy.dangNhap('phantich@commerio.vn', 'phantich');
const the = (label: string) => cy.contains('[data-figure]', label);
const bangGianHang = () => cy.findByRole('table', { name: 'Lãi theo gian hàng' });
const coMenu = (label: string, co: boolean) =>
  cy.contains('[data-sidebar="menu-button"]', new RegExp(`^\\s*${label}\\s*$`)).should(co ? 'exist' : 'not.exist');

describe('P5 · Báo cáo kinh doanh', () => {
  context('khoảng ngày (AC-B1)', () => {
    beforeEach(() => cy.dangNhap('ceo@commerio.vn', 'ceo'));

    it('mặc định 30 ngày theo BE; nút nhanh đưa from/to lên URL, tải lại vẫn giữ', () => {
      cy.menu('Báo cáo kinh doanh');
      cy.location('search').should('eq', '');
      cy.contains(`${dmy(vnDay(-29))} – ${dmy(vnDay())}`);
      cy.findByRole('button', { name: '30 ngày' }).should('have.attr', 'aria-pressed', 'true');
      ['7 ngày', 'Tháng này', 'Tháng trước', 'Tuỳ chọn'].forEach((n) => cy.findByRole('button', { name: n }));

      cy.findByRole('button', { name: '7 ngày' }).click();
      cy.location('search').should('eq', `?from=${vnDay(-6)}&to=${vnDay()}`);
      cy.contains(`${dmy(vnDay(-6))} – ${dmy(vnDay())}`);
      cy.reload();
      cy.findByRole('button', { name: '7 ngày' }).should('have.attr', 'aria-pressed', 'true');
      cy.contains(`${dmy(vnDay(-6))} – ${dmy(vnDay())}`);

      cy.findByRole('button', { name: '30 ngày' }).click();
      cy.location('search').should('eq', '');
    });

    it('Tuỳ chọn sai thì zod báo dưới ô, không đổi URL; đúng thì áp dụng', () => {
      cy.visit(BAO_CAO);
      cy.findByRole('button', { name: 'Tuỳ chọn' }).click();
      const nhap = (from: string, to: string) => {
        cy.findByLabelText('Từ ngày').clear().type(from);
        cy.findByLabelText('Đến ngày').clear().type(to);
        cy.findByRole('button', { name: 'Áp dụng' }).click();
      };
      nhap(vnDay(-3), vnDay(-10));
      cy.contains('Từ ngày phải trước hoặc bằng Đến ngày');
      nhap(vnDay(-400), vnDay());
      cy.contains('Khoảng tối đa 366 ngày');
      nhap(vnDay(2), vnDay(5));
      cy.contains('Từ ngày không được sau hôm nay');
      cy.location('search').should('eq', '');

      nhap(vnDay(-12), vnDay(-2));
      cy.location('search').should('eq', `?from=${vnDay(-12)}&to=${vnDay(-2)}`);
      cy.contains(`${dmy(vnDay(-12))} – ${dmy(vnDay(-2))}`);
    });

    it('BE trả 422 thì lỗi hiện dưới đúng ô', () => {
      cy.visit(`${BAO_CAO}?from=${vnDay(-3)}&to=${vnDay(-10)}`);
      cy.findByLabelText('Từ ngày').parents('[data-slot=form-item]').should('contain', 'Từ ngày phải trước hoặc bằng đến ngày');
      cy.get('[data-figure]').should('not.exist');
    });
  });

  context('thẻ số, biểu đồ, bảng gian hàng (AC-B2 đến AC-B4)', () => {
    beforeEach(() => cy.dangNhap('ceo@commerio.vn', 'ceo'));

    it('đủ bảy thẻ, giờ tính, chú thích cố định, cảnh báo phí sàn có link sang đối soát', () => {
      cy.visit(BAO_CAO);
      ['Doanh thu', 'Tiền đã thu', 'Phí sàn', 'Phí cổng', 'Phí vận chuyển', 'Giá vốn', 'Lãi'].forEach((l) => the(l).should('contain', '₫'));
      cy.contains(/Số liệu tính lúc \d{2}:\d{2} \d{2}\/\d{2}\/\d{4}/);
      cy.contains('Phí cổng thanh toán và chi phí vận chuyển của đơn tự giao chưa được thu thập, đang tính 0');
      cy.contains('[role=status]', 'Có đơn sàn chưa đối soát, phí sàn của những ngày đó đang tính 0 nên lãi có thể cao hơn thực tế.')
        .findByRole('link', { name: 'Xem đối soát sàn' })
        .click();
      cy.location('pathname').should('eq', '/c/cmp-001/finance/settlements');
    });

    it('khoảng chưa có số: ghi chưa có số liệu, thẻ là 0 ₫', () => {
      cy.visit(`${BAO_CAO}?from=2025-01-01&to=2025-01-31`);
      cy.contains('Chưa có số liệu trong khoảng này');
      the('Doanh thu').find('.tabular-nums').invoke('text').should('match', /^0\s₫$/);
      the('Lãi').find('.tabular-nums').invoke('text').should('match', /^0\s₫$/);
      cy.contains('Có đơn sàn chưa đối soát').should('not.exist');
    });

    it('ngày lãi âm: số âm chữ đỏ', () => {
      cy.visit(`${BAO_CAO}?from=${vnDay(-9)}&to=${vnDay(-9)}`);
      the('Lãi').find('.text-destructive').invoke('text').should('match', /^-150\.000\s₫$/);
      bangGianHang().contains('tr', 'Tạo tay').should('contain', '-50,0%');
    });

    it('biểu đồ ba đường, rê chuột hiện ngày và số; lọc nguồn, gian hàng trên URL', () => {
      cy.visit(`${BAO_CAO}?from=${vnDay(-6)}&to=${vnDay()}`);
      cy.get('[data-testid=daily-chart] .recharts-legend-wrapper')
        .should('contain', 'Doanh thu')
        .and('contain', 'Tiền đã thu')
        .and('contain', 'Lãi');
      cy.get('[data-testid=daily-chart] .recharts-line').should('have.length', 3);
      cy.get('[data-testid=daily-chart] .recharts-wrapper > .recharts-surface').trigger('mousemove', 'center');
      cy.get('[data-testid=daily-chart] .recharts-tooltip-wrapper')
        .should('contain', dmy(vnDay(-3)))
        .and('contain', 'Doanh thu')
        .and('contain', '₫');

      cy.chon('Nguồn', 'Hộp thư');
      cy.location('search').should('contain', 'source=inbox');
      cy.findByRole('combobox', { name: 'Gian hàng' }).should('be.disabled');
      cy.chon('Nguồn', 'Sàn TMĐT');
      cy.chon('Gian hàng', /ABC Fashion TikTok Shop/);
      cy.location('search').should('contain', 'source=marketplace').and('contain', 'shopId=shp-002');
      cy.reload();
      cy.findByRole('combobox', { name: 'Gian hàng' }).should('contain', 'ABC Fashion TikTok Shop');
      // Đổi bộ lọc biểu đồ không đổi thẻ số
      the('Doanh thu').invoke('text').should('not.contain', ' 0 ₫');
    });

    it('bảng gian hàng: tên kênh, dòng Tổng, sắp xếp, gộp theo nguồn, cảnh báo phí sàn', () => {
      cy.visit(BAO_CAO);
      bangGianHang().within(() => {
        cy.contains('th', 'Doanh thu').should('have.attr', 'aria-sort', 'descending');
        cy.contains('tbody tr', 'ABC Fashion TikTok Shop').should('contain', 'TikTok Shop');
        cy.contains('tbody tr', 'ABC Fashion Official').should('contain', 'Shopee');
        cy.contains('tbody tr', 'Hộp thư');
        cy.contains('tbody tr', 'Tạo tay');
        cy.contains('tbody tr', 'Gian hàng đã xoá');
        cy.contains('th', 'Biên lãi');
        cy.get('tfoot tr').should('contain', 'Tổng').and('contain', '%');
        cy.get('tbody tr').first().should('contain', 'ABC Fashion TikTok Shop');

        cy.contains('th', 'Phí vận chuyển').find('button').click();
        cy.contains('th', 'Phí vận chuyển').should('have.attr', 'aria-sort', 'descending');
        cy.contains('th', 'Phí vận chuyển').find('button').click();
        cy.contains('th', 'Phí vận chuyển').should('have.attr', 'aria-sort', 'ascending');
        cy.get('tbody tr').first().should('contain', 'Tạo tay');

        cy.contains('tbody tr', 'ABC Fashion TikTok Shop').findByLabelText('Phí sàn chưa đối soát').focus();
      });
      cy.findByRole('tooltip').should('contain', 'Phí sàn chưa đối soát');

      bangGianHang().find('tfoot').invoke('text').then((tong) => {
        cy.findByRole('switch', { name: 'Gộp theo nguồn' }).click();
        bangGianHang().find('tbody tr').should('have.length', 3);
        bangGianHang().contains('tbody tr', 'Sàn TMĐT');
        bangGianHang().find('tfoot').invoke('text').should('eq', tong);
      });
    });
  });

  context('xuất CSV (AC-X1, AC-X2)', () => {
    beforeEach(() => cy.dangNhap('ceo@commerio.vn', 'ceo'));

    it('xuất Lãi theo gian hàng: tên tệp theo BE, BOM, tiêu đề tiếng Việt, dòng Tổng', () => {
      const from = vnDay(-6);
      const to = vnDay();
      const file = `cypress/downloads/bao-cao-shops-${from}-${to}.csv`;
      cy.visit(`${BAO_CAO}?from=${from}&to=${to}`);
      cy.findByRole('button', { name: 'Xuất CSV' }).click();
      cy.findByRole('menuitem', { name: 'Tổng quan' });
      cy.findByRole('menuitem', { name: 'Theo ngày' });
      cy.findByRole('menuitem', { name: 'Lãi theo gian hàng' }).click();
      cy.toast('Đã xuất báo cáo');
      cy.readFile(file, null).then((buf: Uint8Array) => {
        expect([buf[0], buf[1], buf[2]]).to.deep.equal([0xef, 0xbb, 0xbf]);
        const text = new TextDecoder().decode(buf);
        expect(text).to.contain('Doanh thu,Tiền đã thu,Phí sàn,Phí cổng,Phí vận chuyển,Giá vốn,Lãi');
        expect(text.trim().split('\r\n').pop()).to.match(/^Tổng/);
      });
    });

    it('xuất Theo ngày gửi kèm bộ lọc đang xem', () => {
      const from = vnDay(-6);
      const to = vnDay();
      const file = `cypress/downloads/bao-cao-daily-${from}-${to}.csv`;
      cy.visit(`${BAO_CAO}?from=${from}&to=${to}&source=inbox`);
      cy.findByRole('button', { name: 'Xuất CSV' }).click();
      cy.findByRole('menuitem', { name: 'Theo ngày' }).click();
      cy.toast('Đã xuất báo cáo');
      cy.readFile(file).should('contain', 'Ngày');
    });

    it('BE trả lỗi thì báo, không tải tệp', () => {
      cy.visit(BAO_CAO);
      the('Doanh thu').should('exist');
      cy.mockApi('get', '/report/export', 403, { status: 403, code: 'forbidden', title: 'Forbidden' });
      cy.findByRole('button', { name: 'Xuất CSV' }).click();
      cy.findByRole('menuitem', { name: 'Tổng quan' }).click();
      cy.toast(KHONG_QUYEN_THAO_TAC);
      cy.contains('[data-sonner-toast]', 'Đã xuất báo cáo').should('not.exist');
    });
  });

  context('thiếu quyền giá vốn và xuất tệp (AC-B5, AC-X1)', () => {
    it('Phân tích: không có Giá vốn, Lãi, Biên lãi, đường Lãi, nút Xuất CSV', () => {
      phantich();
      cy.menu('Báo cáo kinh doanh');
      the('Doanh thu').should('exist');
      the('Phí sàn').should('exist');
      cy.get('[data-figure=cogs], [data-figure=profit]').should('not.exist');
      bangGianHang().find('th').should('have.length', 6).and('not.contain', 'Giá vốn').and('not.contain', 'Lãi');
      bangGianHang().contains('tbody tr', 'Hộp thư').should('not.contain', '%');
      cy.get('[data-testid=daily-chart] .recharts-line').should('have.length', 2);
      cy.get('[data-testid=daily-chart] .recharts-legend-wrapper').should('not.contain', 'Lãi');
      cy.findByRole('button', { name: 'Xuất CSV' }).should('not.exist');
    });
  });

  context('phân quyền, phân hệ, lỗi BE (AC-P1 đến AC-P3)', () => {
    it('CEO thấy Báo cáo kinh doanh và Đối soát sàn', () => {
      cy.dangNhap('ceo@commerio.vn', 'ceo');
      coMenu('Báo cáo kinh doanh', true);
      coMenu('Đối soát sàn', true);
    });

    it('Phân tích thấy Báo cáo kinh doanh và Đối soát sàn (chỉ xem)', () => {
      phantich();
      coMenu('Báo cáo kinh doanh', true);
      coMenu('Đối soát sàn', true);
    });

    (['ketoan', 'kiemsoat'] as const).forEach((u) =>
      it(`${u}: thấy Đối soát sàn, không thấy Báo cáo kinh doanh`, () => {
        cy.dangNhap(`${u}@commerio.vn`, u);
        coMenu('Đối soát sàn', true);
        coMenu('Báo cáo kinh doanh', false);
      }),
    );

    it('Kho không thấy Báo cáo kinh doanh', () => {
      cy.dangNhap('kho@commerio.vn', 'kho');
      cy.menu('Tổng quan');
      coMenu('Báo cáo kinh doanh', false);
    });

    it('Admin có quyền xem báo cáo nhưng thiếu quyền tài chính (D18): không có menu, gõ đường dẫn bị chặn', () => {
      cy.dangNhap('admin@commerio.vn', 'admin');
      cy.menu('Tổng quan');
      coMenu('Báo cáo kinh doanh', false);
      cy.visit(BAO_CAO);
      cy.contains(CHAN_QUYEN);
    });

    it('Sale không có menu, gõ đường dẫn bị chặn', () => {
      cy.dangNhap('sale@commerio.vn', 'sale');
      cy.menu('Tổng quan');
      coMenu('Báo cáo kinh doanh', false);
      cy.visit(BAO_CAO);
      cy.contains(CHAN_QUYEN);
    });

    it('công ty chưa bật Báo cáo: không có menu, gõ đường dẫn báo phân hệ chưa bật', () => {
      cy.dangNhap('ceo@commerio.vn', 'ceo', 'Minh Phát');
      cy.menu('Tổng quan');
      coMenu('Báo cáo kinh doanh', false);
      cy.visit('/c/cmp-003/reports');
      cy.get('main').should('contain', 'Phân hệ chưa bật');
    });

    it('BE trả 403 module_disabled hoặc forbidden thì báo lỗi, không hiện số cũ', () => {
      cy.dangNhap('ceo@commerio.vn', 'ceo');
      cy.visit(BAO_CAO);
      the('Doanh thu').should('exist');
      cy.mockApi('get', '/report/overview', 403, { status: 403, code: 'module_disabled', title: 'Phân hệ Báo cáo đang tắt' });
      cy.findByRole('button', { name: '7 ngày' }).click();
      cy.contains('[role=alert]', 'Phân hệ này đã bị tắt');
      cy.get('[data-figure]').should('not.exist');

      cy.mockApi('get', '/report/shops', 403, { status: 403, code: 'forbidden', title: 'Forbidden' });
      cy.findByRole('button', { name: 'Tháng này' }).click();
      cy.contains('[role=alert]', KHONG_QUYEN_THAO_TAC);
      cy.get('[data-figure]').should('not.exist');
      bangGianHang().should('not.exist');
    });
  });
});
