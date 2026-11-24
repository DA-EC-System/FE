// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ShopReadiness } from '@/types/blocker';
import { ProductCompletionRail } from './ProductCompletionRail';
import { ReadinessNote } from './ReadinessNote';
import { ProductFixContext } from './productFix';

const category = { state: 'chosen', externalCategoryId: '1', path: 'A/B', source: 'push', maxAxes: 2, combinable: true } as const;
const lazada: ShopReadiness = {
  shopId: 's1',
  shopName: 'Đùi Gà Store',
  platform: 'lazada',
  status: 'blocked',
  counts: { ready: 0, blocked: 2, listed: 0 },
  category,
  blockers: [
    { code: 'spec_incomplete', label: 'Thiếu attribute Thương hiệu', scope: 'platform', target: { kind: 'spec_attribute', attributeCode: 'brand' }, variantIds: [] },
    { code: 'weight_missing', label: 'Thiếu cân nặng của 2 SKU', scope: 'common', target: { kind: 'variant_field', field: 'weight' }, variantIds: ['v1', 'v2'] },
    { code: 'fee_not_configured', label: 'Gian hàng chưa cài phí sàn', scope: 'shop', target: { kind: 'shop', field: 'fee_config' }, variantIds: [] },
  ],
  variants: [],
};
const tiktok: ShopReadiness = { ...lazada, shopId: 's2', shopName: 'Gà TikTok', platform: 'tiktok', status: 'ready', counts: { ready: 2, blocked: 0, listed: 0 }, blockers: [] };

afterEach(cleanup);

describe('ReadinessNote: mục chặn đầu tab sàn (FE#458)', () => {
  it('mỗi mục một dòng, nút sửa mở tại chỗ; không có quyền tài chính thì ẩn nút Cài phí sàn', async () => {
    const openFix = vi.fn(() => true);
    render(
      <MemoryRouter>
        <ProductFixContext.Provider value={openFix}>
          <ReadinessNote companyId="c1" productId="p1" readiness={lazada} can={{ product: true, finance: false }} />
        </ProductFixContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('readiness-note').textContent).toContain('Còn 3 mục trước khi đăng lên Đùi Gà Store (Lazada)');
    const items = screen.getAllByTestId('readiness-item');
    expect(items).toHaveLength(3);
    expect(within(items[2]).queryByTestId('readiness-fix')).toBeNull();
    await userEvent.click(within(items[1]).getByTestId('readiness-fix'));
    expect(openFix).toHaveBeenCalledWith('/c/c1/catalog/products/p1?spec=v1&field=weightG');
  });

  it('gian hàng đăng được: một dòng xác nhận', () => {
    render(
      <MemoryRouter>
        <ReadinessNote companyId="c1" productId="p1" readiness={tiktok} can={{ product: true, finance: true }} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('readiness-note').textContent).toBe('Đủ thông tin để đăng lên Gà TikTok (TikTok Shop).');
  });
});

describe('ProductCompletionRail theo gian hàng (FE#458)', () => {
  const base = { items: [], saveLabel: 'Lưu', saveDisabled: false, publishHref: '/x', publishBlocker: null, isNew: false };

  it('không gian hàng nào đăng được: không ghi "Sẵn sàng", liệt kê số mục từng gian hàng', () => {
    render(
      <MemoryRouter>
        <ProductCompletionRail {...base} shops={[lazada]} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Chưa đăng được gian hàng nào')).toBeTruthy();
    expect(screen.queryByText('Sẵn sàng')).toBeNull();
    expect(screen.getByTestId('rail-shops').textContent).toContain('3 mục');
  });

  it('có gian hàng đăng được: "Sẵn sàng" kèm tên gian hàng', () => {
    render(
      <MemoryRouter>
        <ProductCompletionRail {...base} shops={[lazada, tiktok]} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Sẵn sàng')).toBeTruthy();
    expect(screen.getByText(/Đủ thông tin để đăng lên Gà TikTok \(TikTok Shop\)/)).toBeTruthy();
  });
});
