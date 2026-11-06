import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { getErrorMessage, notImplementedMessage, type ProblemDetails } from './client';
import { openOrdersMessage, problemMessage, shopMismatchMessage } from './problemMessages';

const loi = (data: ProblemDetails) =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: data.status ?? 409,
    statusText: 'Conflict',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data,
  });

describe('shop_has_open_orders (§18.6.1)', () => {
  it('có openOrders thì câu kèm số đơn', () => {
    expect(problemMessage(loi({ status: 409, code: 'shop_has_open_orders', openOrders: 3 }))).toBe(
      'Còn 3 đơn chưa xong. Đợi các đơn hoàn tất hoặc huỷ rồi ngắt.',
    );
  });

  it('BE cũ thiếu openOrders thì báo câu không có số', () => {
    expect(problemMessage(loi({ status: 409, code: 'shop_has_open_orders' }))).toBe(
      'Còn đơn chưa xong. Đợi các đơn hoàn tất hoặc huỷ rồi ngắt.',
    );
    expect(openOrdersMessage(0)).toBe('Còn đơn chưa xong. Đợi các đơn hoàn tất hoặc huỷ rồi ngắt.');
    expect(openOrdersMessage('2')).toBe('Còn đơn chưa xong. Đợi các đơn hoàn tất hoặc huỷ rồi ngắt.');
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
