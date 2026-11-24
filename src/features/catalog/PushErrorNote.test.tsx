// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductListingRow } from '@/types/shop';
import { PushErrorNote } from './PlatformTab';
import { ProductFixContext } from './productFix';

const path = '/c/c1/catalog/products/p1';
const row = {
  variantId: 'v1',
  productId: 'p1',
  sku: 'SKU-1',
  shopId: 's1',
  shopName: 'Shop A',
  platform: 'lazada',
  listing: {
    status: 'push_failed',
    pushError: {
      code: 'marketplace_rejected',
      kind: 'data',
      message: 'Cân nặng phải là số',
      target: { kind: 'variant_field', field: 'weight' },
      variantId: 'v1',
      platformCode: 'BIZ_CHECK_MEASURE_PROP_TEXT_INVALID',
      at: '2026-11-24T00:00:00.000Z',
    },
  },
} as unknown as ProductListingRow;

function Where() {
  const l = useLocation();
  return <span data-testid="where">{l.pathname + l.search}</span>;
}

function renderNote(openFix: ((to: string) => boolean) | null) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ProductFixContext.Provider value={openFix}>
        <PushErrorNote companyId="c1" row={row} can={{ product: true, finance: false }} />
      </ProductFixContext.Provider>
      <Where />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('PushErrorNote: nút sửa lỗi cân nặng (review PR #480)', () => {
  it('trong trang sản phẩm: gọi openFix với ô Khối lượng của SKU, URL không đổi', async () => {
    const openFix = vi.fn(() => true);
    renderNote(openFix);
    await userEvent.click(screen.getByTestId('error-fix'));
    expect(openFix).toHaveBeenCalledWith(`${path}?spec=v1&field=weightG`);
    expect(screen.getByTestId('where').textContent).toBe(path);
  });

  it('ngoài trang sản phẩm (không có openFix): đi theo link', async () => {
    renderNote(null);
    expect(screen.getByTestId('error-fix').textContent).toBe('Sửa cân nặng');
    await userEvent.click(screen.getByTestId('error-fix'));
    expect(screen.getByTestId('where').textContent).toBe(`${path}?spec=v1&field=weightG`);
  });
});
