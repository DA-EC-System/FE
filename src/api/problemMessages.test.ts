import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import type { ProblemDetails } from './client';
import { openOrdersMessage, problemMessage } from './problemMessages';

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
