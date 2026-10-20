// P5 · Đối soát tiền sàn: bảng kê, dòng đối soát, chênh lệch, đối soát ngay, nhãn trên đơn (UC-PF-10; FE#13)

const CHAN_QUYEN = 'Vai trò của bạn trong công ty này không có quyền mở trang này.';
const DOI_SOAT = '/c/cmp-001/finance/settlements';

const ketoan = () => cy.dangNhap('ketoan@commerio.vn', 'ketoan');

describe('P5 · Đối soát tiền sàn', () => {
  context('danh sách bảng kê (AC-S1)', () => {
    beforeEach(ketoan);

    it('menu Đối soát sàn mở danh sách mới nhất trước, đủ cột, số chênh lệch tô cảnh báo', () => {
      cy.menu('Đối soát sàn');
      cy.location('pathname').should('eq', DOI_SOAT);
      ['Mã bảng kê sàn', 'Gian hàng', 'Thời điểm bảng kê', 'Sàn trả', 'Trạng thái trả', 'Số dòng', 'Khớp', 'Chênh lệch', 'Sàn đã hoàn', 'Phiếu thu đã sinh'].forEach(
        (h) => cy.contains('thead th', h),
      );
      cy.get('tbody tr').first().should('have.attr', 'data-row-id', 'stm-0002');
      cy.dong('stm-0002').should('contain', '7395018264001').and('contain', 'ABC Fashion TikTok Shop (TikTok Shop)').and('contain', 'Đang xử lý');
      cy.dong('stm-0001').should('contain', '2026101400001').and('contain', 'ABC Fashion Official (Shopee)').and('contain', 'Đã trả');
      cy.dong('stm-0001').find('[data-warn]').should('have.text', '3');
      cy.dong('stm-0002').find('[data-warn]').should('not.exist');
      cy.dong('stm-0003').should('contain', 'Thất bại');
    });

    it('lọc gian hàng, trạng thái trả, ngày lên URL; không có kết quả thì báo', () => {
      cy.visit(DOI_SOAT);
      cy.chon('Gian hàng', /ABC Fashion Official/);
      cy.location('search').should('contain', 'shopId=shp-001');
      cy.get('tbody tr').should('have.length', 1);
      cy.dong('stm-0001');
      cy.chon('Trạng thái trả', 'Đang xử lý');
      cy.location('search').should('contain', 'paymentStatus=PROCESSING');
      cy.contains('Không có bảng kê phù hợp');

      cy.visit(`${DOI_SOAT}?from=2026-10-16`);
      cy.dong('stm-0002');
      cy.get('tbody tr[data-row-id=stm-0001]').should('not.exist');
    });

    it('bấm dòng mở chi tiết bảng kê', () => {
      cy.visit(DOI_SOAT);
      cy.dong('stm-0001').click();
      cy.location('pathname').should('eq', `${DOI_SOAT}/stm-0001`);
      cy.contains('h1', 'Bảng kê 2026101400001');
    });
  });

  context('chi tiết bảng kê (AC-S2)', () => {
    beforeEach(ketoan);

    it('đầu trang đủ thông tin và kết quả khớp', () => {
      cy.visit(`${DOI_SOAT}/stm-0001`);
      cy.contains('h1', 'Bảng kê 2026101400001');
      ['Gian hàng', 'Mã bảng kê sàn', 'Thời điểm bảng kê', 'Trạng thái trả', 'Sàn trả', 'Phiếu thu đã sinh', 'Số dòng'].forEach((l) => cy.contains(l));
      cy.contains('Khớp 1');
      cy.contains('Chênh lệch 3');
      cy.contains('Sàn đã hoàn 1');
      cy.get('tbody tr[data-row-id]').should('have.length', 5);
    });

    it('cột đơn hàng, kết quả, phiếu thu đúng từng loại dòng', () => {
      cy.visit(`${DOI_SOAT}/stm-0001`);
      cy.dong('stl-line-0001').should('contain', 'Khớp').findByRole('link', { name: 'PT-000005' });
      cy.dong('stl-line-0002').should('contain', '2610149999999').and('contain', 'Không có trong hệ thống').and('contain', 'Không tìm thấy đơn');
      cy.dong('stl-line-0003').should('contain', 'Lệch doanh thu');
      cy.dong('stl-line-0004').should('contain', 'Giữ lại').and('contain', 'Sai công thức');
      cy.dong('stl-line-0005').should('contain', 'Sàn đã hoàn');
    });

    it('mở rộng dòng: bảy ô phí, phép kiểm công thức, lệch tô đỏ', () => {
      cy.visit(`${DOI_SOAT}/stm-0001`);
      cy.dong('stl-line-0001').findByRole('button', { name: 'Mở rộng' }).click();
      cy.get('[data-expanded-for=stl-line-0001] [data-testid=line-breakdown]').within(() => {
        ['Hoa hồng', 'Phí giao dịch', 'Phí hạ tầng', 'Tiếp thị liên kết', 'Chiến dịch', 'Thuế', 'Khác'].forEach((l) => cy.contains(l));
        cy.contains('Doanh thu − Phí − Vận chuyển + Điều chỉnh');
        cy.get('.text-destructive').should('not.exist');
      });
      cy.dong('stl-line-0001').findByRole('button', { name: 'Thu gọn' }).click();
      cy.get('[data-expanded-for=stl-line-0001]').should('not.exist');

      cy.dong('stl-line-0004').findByRole('button', { name: 'Mở rộng' }).click();
      cy.get('[data-expanded-for=stl-line-0004]').contains('.text-destructive', /^Lệch 5\.000\s₫$/);

      cy.dong('stl-line-0003').findByRole('button', { name: 'Mở rộng' }).click();
      cy.get('[data-expanded-for=stl-line-0003]').contains(/Doanh thu sàn 170\.000\s₫, tổng đơn .+, lệch .+₫/);

      cy.dong('stl-line-0005').findByRole('button', { name: 'Mở rộng' }).click();
      cy.get('[data-expanded-for=stl-line-0005]').should('contain', 'sàn hoàn');
    });

    it('tab Khớp / Chênh lệch / Sàn đã hoàn lọc dòng trên URL', () => {
      cy.visit(`${DOI_SOAT}/stm-0001`);
      cy.findByRole('tab', { name: 'Chênh lệch' }).click();
      cy.location('search').should('contain', 'match=discrepancy');
      cy.get('tbody tr[data-row-id]').should('have.length', 3);
      cy.findByRole('tab', { name: 'Sàn đã hoàn' }).click();
      cy.get('tbody tr[data-row-id]').should('have.length', 1);
      cy.dong('stl-line-0005');
      cy.findByRole('tab', { name: 'Tất cả' }).click();
      cy.location('search').should('eq', '');
    });

    it('?line= tô sáng và mở sẵn dòng', () => {
      cy.visit(`${DOI_SOAT}/stm-0001?line=stl-line-0003`);
      cy.dong('stl-line-0003').should('have.class', 'bg-primary/10');
      cy.get('[data-expanded-for=stl-line-0003] [data-testid=line-breakdown]');
    });

    it('bảng kê không có hoặc của công ty khác thì báo không tìm thấy', () => {
      cy.visit(`${DOI_SOAT}/stm-khong-co`);
      cy.contains('Không tìm thấy bảng kê. Bảng kê không tồn tại hoặc không thuộc công ty này.');
      cy.findByRole('button', { name: 'Đối soát sàn' }).click();
      cy.location('pathname').should('eq', DOI_SOAT);
    });
  });

  context('tab Chênh lệch (AC-S3)', () => {
    beforeEach(ketoan);

    it('liệt kê mọi dòng chênh lệch, link về bảng kê, lọc lý do', () => {
      cy.visit(DOI_SOAT);
      cy.findByRole('tab', { name: 'Chênh lệch' }).click();
      cy.location('search').should('contain', 'tab=discrepancies');
      cy.get('tbody tr[data-row-id]').should('have.length', 4);
      ['Bảng kê', 'Mã giao dịch sàn', 'Loại', 'Đơn hàng', 'Doanh thu', 'Tiền về', 'Tổng đơn', 'Lý do'].forEach((h) => cy.contains('thead th', h));
      cy.dong('stl-line-0009').should('contain', '7395018263777').and('contain', 'Không tìm thấy đơn');

      cy.chon('Lý do', 'Lệch doanh thu');
      cy.get('tbody tr[data-row-id]').should('have.length', 1);
      cy.dong('stl-line-0003').findByRole('link', { name: '2026101400001' }).click();
      cy.location('pathname').should('eq', `${DOI_SOAT}/stm-0001`);
    });
  });

  context('đối soát ngay (AC-S4)', () => {
    it('Kế toán chạy cho mọi gian hàng hoặc một gian hàng', () => {
      ketoan();
      cy.visit(DOI_SOAT);
      cy.findByRole('button', { name: 'Đối soát ngay' }).click();
      cy.contains('[role=dialog]', 'Đối soát ngay').within(() => {
        cy.findByRole('combobox', { name: 'Gian hàng' }).should('contain', 'Mọi gian hàng');
        cy.findByRole('button', { name: 'Đối soát' }).click();
      });
      cy.toast('Đã bắt đầu đối soát, kết quả sẽ hiện khi chạy xong');
      cy.get('[role=dialog]').should('not.exist');
    });

    it('BE trả 409 thì báo trong hộp thoại; 422 thì báo dưới ô gian hàng', () => {
      ketoan();
      cy.visit(DOI_SOAT);
      cy.dong('stm-0001');
      cy.mockApi('post', '/finance/settlements/run', 409, { status: 409, code: 'run_in_progress', title: 'Conflict' });
      cy.findByRole('button', { name: 'Đối soát ngay' }).click();
      cy.contains('[role=dialog]', 'Đối soát ngay').within(() => {
        cy.findByRole('button', { name: 'Đối soát' }).click();
        cy.contains('[role=alert]', 'Lần đối soát trước chưa chạy xong, thử lại sau.');
      });
      cy.mockApi('post', '/finance/settlements/run', 422, {
        status: 422,
        code: 'validation_failed',
        title: 'Invalid',
        errors: { shopId: 'Gian hàng đã ngắt kết nối' },
      });
      cy.contains('[role=dialog]', 'Đối soát ngay').within(() => {
        cy.findByRole('button', { name: 'Đối soát' }).click();
        cy.contains('Gian hàng đã ngắt kết nối');
        cy.findByRole('button', { name: 'Huỷ' }).click();
      });
      cy.get('[role=dialog]').should('not.exist');
    });

    it('Kiểm soát chỉ xem: không có nút Đối soát ngay', () => {
      cy.dangNhap('kiemsoat@commerio.vn', 'kiemsoat');
      cy.menu('Đối soát sàn');
      cy.dong('stm-0001');
      cy.findByRole('button', { name: 'Đối soát ngay' }).should('not.exist');
    });
  });

  context('nhãn trên chi tiết đơn (AC-S5)', () => {
    it('đơn sàn có dòng hoàn và chênh lệch: hai nhãn, nhãn Sàn đã hoàn mở bảng kê', () => {
      ketoan();
      cy.visit('/c/cmp-001/sales/orders/ord-1002');
      cy.contains('Chênh lệch đối soát');
      cy.findByRole('link', { name: 'Sàn đã hoàn' }).click();
      cy.location('pathname').should('eq', `${DOI_SOAT}/stm-0001`);
    });

    it('đơn khớp bình thường không có nhãn', () => {
      ketoan();
      cy.visit('/c/cmp-001/sales/orders/ord-1012');
      cy.contains('h1', /.+/);
      cy.contains('Chênh lệch đối soát').should('not.exist');
      cy.findByRole('link', { name: 'Sàn đã hoàn' }).should('not.exist');
    });
  });

  context('phân quyền và phân hệ', () => {
    it('Sale không có menu, gõ đường dẫn bị chặn', () => {
      cy.dangNhap('sale@commerio.vn', 'sale');
      cy.menu('Tổng quan');
      cy.contains('[data-sidebar="menu-button"]', 'Đối soát sàn').should('not.exist');
      cy.visit(DOI_SOAT);
      cy.contains(CHAN_QUYEN);
    });

    it('công ty chưa bật Kênh bán: gõ đường dẫn báo phân hệ chưa bật', () => {
      cy.dangNhap('ceo@commerio.vn', 'ceo', 'Minh Phát');
      cy.menu('Tổng quan');
      cy.contains('[data-sidebar="menu-button"]', 'Đối soát sàn').should('not.exist');
      cy.visit('/c/cmp-003/finance/settlements');
      cy.get('main').should('contain', 'Phân hệ chưa bật');
    });
  });
});
