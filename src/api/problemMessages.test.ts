import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { getErrorMessage, notImplementedMessage, type ProblemDetails } from './client';
import {
  isRouteMissing,
  openOrdersMessage,
  problemMessage,
  problemSummary,
  shopMismatchMessage,
  tokenErrorMessage,
  updateContentMessage,
} from './problemMessages';

const loi = (data: ProblemDetails) =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: data.status ?? 409,
    statusText: 'Conflict',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data,
  });

describe('mã mới của Documents#55 (FE#153)', () => {
  it.each([
    ['product_in_use', 'Sản phẩm đã hoàn thiện hoặc đã có chứng từ, listing nên không xoá hẳn được. Dùng Lưu trữ.'],
    ['too_many_axes', 'Một sản phẩm tối đa 2 thuộc tính phân loại (vd Màu, Cỡ).'],
    ['unsupported_file_type', 'Chỉ nhận tệp CSV, XLSX hoặc TXT.'],
    ['evidence_required', 'Tài xế để hàng lại mà có lỗi hoặc thiếu: đính ảnh mở thùng trước khi nhập kho.'],
    ['shop_not_active', 'Gian hàng chưa hoạt động. Hoàn tất thiết lập gian hàng trước khi đăng bán.'],
    [
      'handover_confirmed_by_platform',
      'Không huỷ bàn giao được: sàn đã xác nhận lấy hàng, hoặc kiện không được bàn giao bằng quét ở kho.',
    ],
  ])('%s có câu tiếng Việt, không dùng detail của BE', (code, text) => {
    expect(problemMessage(loi({ status: 409, code, detail: 'English detail' }))).toBe(text);
  });
});

describe('shop_has_open_orders (§18.6.1)', () => {
  it('có openOrders thì câu kèm số đơn', () => {
    expect(problemMessage(loi({ status: 409, code: 'shop_has_open_orders', openOrders: 3 }))).toBe(
      'Còn 3 đơn chưa xong. Đợi các đơn hoàn thành hoặc huỷ rồi ngắt.',
    );
  });

  it('BE cũ thiếu openOrders thì báo câu không có số', () => {
    expect(problemMessage(loi({ status: 409, code: 'shop_has_open_orders' }))).toBe(
      'Còn đơn chưa xong. Đợi các đơn hoàn thành hoặc huỷ rồi ngắt.',
    );
    expect(openOrdersMessage(0)).toBe('Còn đơn chưa xong. Đợi các đơn hoàn thành hoặc huỷ rồi ngắt.');
    expect(openOrdersMessage('2')).toBe('Còn đơn chưa xong. Đợi các đơn hoàn thành hoặc huỷ rồi ngắt.');
  });
});

describe('company_mismatch (§18.7.11)', () => {
  it('nêu tên hai công ty', () => {
    const e = loi({
      status: 409,
      code: 'company_mismatch',
      expected: { id: 'cmp-001', name: 'ABC Fashion' },
      actual: { id: 'cmp-002', name: 'Gạo Miền Tây' },
    });
    expect(problemMessage(e)).toBe(
      'Bạn bắt đầu kết nối ở công ty ABC Fashion nhưng đang mở Gạo Miền Tây. Chuyển sang ABC Fashion rồi kết nối lại.',
    );
  });
  it('thiếu expected hoặc actual thì dùng câu chung', () => {
    expect(problemMessage(loi({ status: 409, code: 'company_mismatch' }))).toBe(
      'Bạn bắt đầu kết nối ở một công ty khác với công ty đang mở. Chuyển về công ty đó rồi kết nối lại.',
    );
  });
});

describe('shop_mismatch (§18.4)', () => {
  it('có expected và actual thì nêu tài khoản vừa đăng nhập; tên null thì dùng mã gian hàng', () => {
    const e = loi({
      status: 409,
      code: 'shop_mismatch',
      expected: { name: 'Shop A', externalShopId: '100' },
      actual: { name: null, externalShopId: '200' },
    });
    expect(problemMessage(e)).toBe(
      'Bạn vừa đăng nhập 200, không phải Shop A. Đăng xuất trên sàn, đăng nhập đúng tài khoản rồi kết nối lại.',
    );
  });
  it('thiếu expected hoặc actual thì dùng câu chung', () => {
    expect(shopMismatchMessage(undefined, { name: 'B', externalShopId: '2' })).toMatch(/không phải/);
  });
});

describe('not_implemented 501 (R13)', () => {
  const body = {
    status: 501,
    code: 'not_implemented',
    detail: 'createOpeningStocktake chưa làm (commerio-backend#245, Bình)',
  };

  it('nêu issue và người phụ trách, không hiện detail thô', () => {
    const e = loi({ ...body, issue: 'commerio-backend#245', owner: 'Bình' });
    expect(problemMessage(e)).toBe('Chức năng này chưa làm xong: thuộc commerio-backend#245 (Bình)');
    // Màn chỉ dùng getErrorMessage cũng nhận câu chung
    expect(getErrorMessage(e)).toBe('Chức năng này chưa làm xong: thuộc commerio-backend#245 (Bình)');
  });

  it('thiếu issue hoặc owner thì câu ngắn', () => {
    expect(problemMessage(loi({ ...body, issue: 'commerio-backend#245' }))).toBe('Chức năng này chưa làm xong');
    expect(problemMessage(loi(body))).toBe('Chức năng này chưa làm xong');
    expect(notImplementedMessage(undefined, 'Bình')).toBe('Chức năng này chưa làm xong');
    expect(notImplementedMessage('  ', '')).toBe('Chức năng này chưa làm xong');
  });
});

describe('đẩy listing (§18.6.8, §18.6.10)', () => {
  it('hết lượt gọi sàn cho thao tác tay', () => {
    const cau = 'Hôm nay đã hết lượt gọi sàn cho thao tác tay. Việc tự động vẫn chạy và sẽ đồng bộ sau.';
    for (const platformCode of ['company_call_limit', 'daily_call_limit']) {
      expect(
        problemMessage(loi({ status: 503, code: 'marketplace_unavailable', platformCode, platformMessage: 'x' })),
      ).toBe(cau);
    }
  });

  it('chờ phân hàng: câu theo waitingFor', () => {
    expect(problemMessage(loi({ code: 'shop_awaiting_allocation', waitingFor: 'open_orders' }))).toBe(
      'Đang đồng bộ đơn còn mở. Đăng bán sau khi lượt này xong.',
    );
    expect(problemMessage(loi({ code: 'shop_awaiting_allocation', waitingFor: 'allocation' }))).toBe(
      'Đang chia hàng cho các kiện sau kiểm kho. Đăng bán sau khi chia xong.',
    );
    expect(problemMessage(loi({ code: 'shop_awaiting_allocation' }))).toBe(
      'Gian hàng đang giữ tồn. Đăng bán sau khi đồng bộ đơn và chia hàng xong.',
    );
  });

  it('lập lại phiếu kiểm kê đầu kỳ: phiếu còn mở nêu số phiếu (§18.6.11)', () => {
    expect(problemMessage(loi({ code: 'opening_stocktake_open', number: 'KK-000012' }))).toBe(
      'Phiếu KK-000012 vẫn đang mở. Sửa hoặc duyệt phiếu này.',
    );
    expect(problemMessage(loi({ code: 'opening_stocktake_open' }))).toBe(
      'Phiếu kiểm kho đầu kỳ vẫn đang mở. Sửa hoặc duyệt phiếu này.',
    );
    expect(problemMessage(loi({ code: 'shop_not_awaiting_stocktake' }))).toBe(
      'Gian hàng không còn chờ phiếu kiểm kho đầu kỳ.',
    );
  });
});

describe('404 vì chưa có route khác 404 bản ghi không có (FE#248)', () => {
  const ROUTE = 'Chức năng này chưa mở trên máy chủ. Nhóm đang làm, bạn chưa cần làm gì.';
  const routeMissing = loi({ status: 404, title: 'Not Found', code: 'not_found', detail: 'Không có đường dẫn GET /api/v1/tasks' });
  const recordMissing = loi({ status: 404, title: 'Not Found', code: 'not_found', detail: 'Không tìm thấy sản phẩm' });

  it('route chưa có: báo chưa mở, không nói bản ghi bị xoá', () => {
    expect(isRouteMissing(routeMissing)).toBe(true);
    expect(problemMessage(routeMissing)).toBe(ROUTE);
  });

  it('route chưa có mà BE không gửi code vẫn nhận ra', () => {
    expect(problemMessage(loi({ status: 404, title: 'Not Found', detail: 'Không có đường dẫn POST /api/v1/x' }))).toBe(ROUTE);
  });

  it('bản ghi không có: giữ câu not_found', () => {
    expect(isRouteMissing(recordMissing)).toBe(false);
    expect(problemMessage(recordMissing)).toBe('Không tìm thấy. Bản ghi đã bị xoá hoặc không thuộc công ty này.');
  });

  it('không phải 404 thì không coi là route chưa có', () => {
    expect(isRouteMissing(loi({ status: 409, code: 'conflict', detail: 'Không có đường dẫn GET /x' }))).toBe(false);
    expect(isRouteMissing(new Error('mạng'))).toBe(false);
  });
});

describe('updateContentMessage: lỗi nút Sửa nội dung (FE#275, §18.3 update-content)', () => {
  it.each([
    ['invalid_transition', 'Listing không còn đang bán'],
    ['listing_unmanaged', 'Liên kết SKU sàn với variant trước'],
    ['shared_remote_product', 'Sửa trên Seller Center'],
    ['marketplace_unavailable', 'chưa đưa được nội dung mới lên'],
    ['marketplace_unsupported', 'chưa hỗ trợ sửa nội dung'],
  ])('%s có câu theo ngữ cảnh sửa nội dung', (code, text) => {
    expect(updateContentMessage(loi({ status: 409, code, detail: 'English detail' }))).toContain(text);
  });

  it('category_unmapped: sản phẩm chưa có thông tin sàn, không nói ghép danh mục', () => {
    const msg = updateContentMessage(loi({ status: 409, code: 'category_unmapped', detail: 'x' }), 'TikTok Shop');
    expect(msg).toBe('Sản phẩm chưa có thông tin TikTok Shop. Điền thông tin sàn của sản phẩm rồi sửa nội dung lại.');
    expect(msg).not.toContain('Ghép danh mục');
  });

  it('spec_incomplete: liệt kê nhãn BE trả trong message', () => {
    expect(
      updateContentMessage(
        loi({ status: 409, code: 'spec_incomplete', detail: 'Spec incomplete', message: 'Thương hiệu, Chất liệu' }),
        'TikTok Shop',
      ),
    ).toBe('Thông tin TikTok Shop của sản phẩm còn thiếu: Thương hiệu, Chất liệu');
    expect(updateContentMessage(loi({ status: 409, code: 'spec_incomplete' }))).toBe('Thông tin sàn của sản phẩm còn thiếu.');
  });

  it('marketplace_rejected: kèm câu của sàn, nói listing giữ nguyên', () => {
    const said = '12019018: description contains contact information';
    expect(updateContentMessage(loi({ status: 409, code: 'marketplace_rejected', detail: said, platformMessage: said }))).toBe(
      `Sàn không nhận bản sửa, listing giữ nguyên. Sàn báo: ${said}`,
    );
    expect(updateContentMessage(loi({ status: 409, code: 'marketplace_rejected', detail: 'Bad title' }))).toBe(
      'Sàn không nhận bản sửa, listing giữ nguyên. Sàn báo: Bad title',
    );
  });

  it('mã khác dùng problemMessage', () => {
    expect(updateContentMessage(loi({ status: 409, code: 'shop_not_active' }))).toBe(
      problemMessage(loi({ status: 409, code: 'shop_not_active' })),
    );
  });
});

describe('lỗi sàn chung theo ngữ cảnh (FE#250, Documents/21 §18.4)', () => {
  const rejected = (extra: ProblemDetails = {}) => loi({ status: 409, code: 'marketplace_rejected', detail: 'Sàn từ chối yêu cầu', ...extra });
  const unauthorized = (extra: ProblemDetails = {}) =>
    loi({ status: 409, code: 'marketplace_unauthorized', detail: 'Sàn từ chối token của gian hàng, cần kết nối lại', ...extra });
  const CONNECT = 'Sàn không nhận lần uỷ quyền này. Liên kết uỷ quyền chỉ dùng được một lần trong vài phút; bấm Kết nối lại từ đầu.';

  it('không truyền ngữ cảnh: câu chung, không còn câu huỷ đơn', () => {
    expect(problemMessage(rejected())).toBe('Sàn từ chối thao tác này.');
    expect(problemMessage(unauthorized())).toBe('Sàn từ chối quyền truy cập của gian hàng. Kết nối lại gian hàng rồi thử lại.');
  });

  it.each([
    ['rts', 'Sàn chưa nhận báo sẵn sàng giao của kiện này. Tải lại kiện để xem trạng thái trên sàn rồi thử lại.'],
    ['push', 'Sàn từ chối đăng bán sản phẩm.'],
    ['remote_skus', 'Sàn chưa trả được danh sách SKU. Thử lại sau ít phút.'],
    ['cancel', 'Sàn không cho huỷ đơn này.'],
    ['connect', CONNECT],
  ] as const)('marketplace_rejected khi %s', (action, text) => {
    expect(problemMessage(rejected(), action)).toBe(text);
  });

  it('callback Lazada mã đã dùng (marketplace_unauthorized InvalidCode) cũng là câu kết nối', () => {
    expect(problemMessage(unauthorized({ platformCode: 'InvalidCode' }), 'connect')).toBe(CONNECT);
  });

  it('no_shop: tài khoản không có gian hàng', () => {
    expect(problemMessage(rejected({ platformCode: 'no_shop' }), 'connect')).toBe(
      'Tài khoản này không có gian hàng nào trên sàn. Đăng nhập (hoặc lấy token) bằng tài khoản người bán có gian hàng.',
    );
  });

  it('too_many_products khi đọc SKU sàn', () => {
    expect(problemMessage(rejected({ platformCode: 'too_many_products' }), 'remote_skus')).toBe(
      'Gian hàng quá 10.000 sản phẩm, sàn không cho đọc hết danh sách.',
    );
  });

  it('ngữ cảnh không đổi câu của mã khác', () => {
    expect(problemMessage(loi({ status: 409, code: 'already_handed_over' }), 'cancel')).toBe('Đơn đã có kiện bàn giao, không huỷ được nữa.');
  });

  it('problemMessage nối câu gốc của sàn, problemSummary tách riêng', () => {
    const e = rejected({ platformMessage: 'invalid auth code' });
    expect(problemMessage(e, 'connect')).toBe(`${CONNECT} Sàn báo: invalid auth code`);
    expect(problemSummary(e, 'connect')).toEqual({ message: CONNECT, platformMessage: 'invalid auth code' });
    expect(problemSummary(rejected(), 'connect')).toEqual({ message: CONNECT });
  });

  describe('dán token', () => {
    it.each([
      ['lazada', 'ở Lazada Open Platform → Testing Tools → API Explorer'],
      ['tiktok', 'ở TikTok Shop Partner Center → API Testing Tool'],
      ['shopee', 'trên trang nhà phát triển của sàn'],
    ])('%s: câu nêu nơi lấy token, cho cả hai mã', (platform, source) => {
      const text = `Sàn từ chối token này. Kiểm tra lại token hoặc lấy token mới ${source}.`;
      expect(tokenErrorMessage(unauthorized({ platformMessage: 'Invalid token' }), platform)).toEqual({
        message: text,
        platformMessage: 'Invalid token',
      });
      expect(tokenErrorMessage(rejected(), platform).message).toBe(text);
    });

    it('no_shop không nói token sai', () => {
      expect(tokenErrorMessage(rejected({ platformCode: 'no_shop' }), 'lazada').message).toMatch(/^Tài khoản này không có gian hàng/);
    });

    it('mã khác giữ câu chung', () => {
      expect(tokenErrorMessage(loi({ status: 422, code: 'marketplace_unsupported' }), 'lazada').message).toBe(
        'Sàn này chưa hỗ trợ thao tác này.',
      );
    });
  });
});

describe('Mã lỗi trang đẩy lên sàn (commerio-backend#400, Documents/21 §18.5)', () => {
  it.each([
    ['product_name_too_short', 'ít nhất 25 ký tự'],
    ['category_not_leaf', 'leaf category'],
    ['category_not_permitted', 'Xin quyền trên Seller Center'],
    ['spec_incomplete', 'còn thiếu'],
    ['category_unmapped', 'Chưa chọn category'],
  ])('%s có câu tiếng Việt', (code, text) => {
    expect(problemMessage(loi({ status: 422, code, detail: 'English' }))).toContain(text);
  });

  it('category_unmapped không còn nói ghép danh mục', () => {
    expect(problemMessage(loi({ status: 422, code: 'category_unmapped' }))).not.toContain('Ghép danh mục');
  });
});

describe('báo sàn, in vận đơn (commerio-backend#239, FE#338)', () => {
  it('KH-B07: cancel_requested có câu riêng, không khuyên tải lại kiện', () => {
    const m = problemMessage(loi({ code: 'cancel_requested', detail: 'x' }), 'rts');
    expect(m).toContain('Khách đang xin huỷ');
    expect(m).not.toContain('Tải lại kiện');
  });

  it('TRA-B06: rts_package_not_found khi app chưa có mã kiện sàn (không platformCode) chỉ cách Kéo đơn ngay', () => {
    expect(problemMessage(loi({ code: 'rts_package_not_found' }), 'rts')).toContain('Kéo đơn ngay');
    expect(problemMessage(loi({ code: 'rts_package_not_found', platformCode: '30012' }), 'rts')).toContain('đóng gói lại');
  });

  it('KH-B03: document_not_ready hiện detail liệt kê mã kiện; document_not_supported nói đơn SOF', () => {
    expect(problemMessage(loi({ code: 'document_not_ready', detail: 'Kiện KH-000001 chưa có vận đơn trên sàn' }))).toBe(
      'Kiện KH-000001 chưa có vận đơn trên sàn',
    );
    expect(problemMessage(loi({ code: 'document_not_supported', platformCode: '50008' }))).toContain('tự giao (SOF)');
  });
});
