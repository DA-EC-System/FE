// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PushPreviewRow } from '@/types/blocker';
import type { ProductDetail } from '@/types/catalog';
import type { ProductListingRow, Shop } from '@/types/shop';
import { PublishPreview } from './PublishPreview';

const preview = vi.hoisted(() => ({ result: [] as unknown[], calls: [] as unknown[] }));
vi.mock('@/api/readiness.api', () => ({
  usePushPreviews: (inputs: unknown) => {
    preview.calls.push(inputs);
    return preview.result;
  },
}));
vi.mock('@/api/shops.api', () => ({
  usePriceQuote: () => ({ mutate: vi.fn() }),
  usePushListings: () => ({ mutateAsync: vi.fn() }),
}));

const product = { id: 'p1', name: 'Áo thun', images: [], variants: [{ id: 'v1', standardPrice: 100000 }, { id: 'v2', standardPrice: 100000 }] } as unknown as ProductDetail;
const shop = { id: 's1', platform: 'lazada', platformName: 'Lazada', shopName: 'Đùi Gà Store', status: 'active' } as unknown as Shop;
const row = (variantId: string, sku: string) =>
  ({
    shopId: 's1',
    shopName: 'Đùi Gà Store',
    platform: 'lazada',
    variantId,
    productId: 'p1',
    sku,
    attributesLabel: '',
    price: 100000,
    netReceived: 80000,
    belowFloor: false,
    feeWarning: null,
    priceSource: 'auto',
    stockToPush: 5,
    stockHeldReason: null,
    listing: null,
  }) as unknown as ProductListingRow;
const rows = [row('v1', 'AO-1'), row('v2', 'AO-2')];

const previewRow = (variantId: string, over: Partial<PushPreviewRow> = {}): PushPreviewRow => ({
  variantId,
  productId: 'p1',
  productName: 'Áo thun',
  attributesLabel: '',
  sku: variantId,
  status: 'ready',
  blockers: [],
  listPrice: 100000,
  rounding: null,
  stockToPush: 5,
  stockHeldReason: null,
  netReceived: 80000,
  feePct: 0.2,
  feeConfigId: 'f1',
  ...over,
});

const renderPreview = (can = { product: true, finance: true }) =>
  render(
    <MemoryRouter>
      <PublishPreview product={product} companyId="c1" shops={[shop]} rows={rows} readyPlatforms={new Set()} can={can} onFixPlatform={vi.fn()} />
    </MemoryRouter>,
  );

beforeEach(() => {
  preview.calls = [];
});
afterEach(cleanup);

describe('PublishPreview: bước 3 lấy mục chặn từ push-preview (FE#458)', () => {
  it('gửi push-preview theo gian hàng; dòng bị chặn hiện mục chặn của BE kèm nút sửa, dòng đủ thì Sẽ đăng', () => {
    preview.result = [
      {
        data: [
          previewRow('v1', {
            status: 'blocked',
            blockers: [
              { code: 'weight_missing', label: 'Thiếu cân nặng', scope: 'common', target: { kind: 'variant_field', field: 'weight' }, variantIds: ['v1'] },
              { code: 'fee_not_configured', label: 'Gian hàng chưa cài phí sàn', scope: 'shop', target: { kind: 'shop', field: 'fee_config' }, variantIds: [] },
            ],
          }),
          previewRow('v2'),
        ],
        isError: false,
        isLoading: false,
      },
    ];
    renderPreview({ product: true, finance: false });
    expect(preview.calls.at(-1)).toEqual([{ shopId: 's1', variantIds: ['v1', 'v2'] }]);
    const list = screen.getByTestId('preview-blockers');
    expect(list.textContent).toContain('Chưa đăng: Thiếu cân nặng');
    expect(list.textContent).toContain('Chưa đăng: Gian hàng chưa cài phí sàn');
    // Không có quyền tài chính: chỉ còn nút sửa cân nặng
    const fixes = screen.getAllByTestId('preview-fix');
    expect(fixes).toHaveLength(1);
    expect(fixes[0]!.getAttribute('href')).toBe('/c/c1/catalog/products/p1?spec=v1&field=weightG');
    // Sàn chưa "đủ thông tin" theo bước 2 nhưng BE cho đăng v2: theo BE, không tự tính
    expect(screen.getByText('Sẽ đăng')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Đăng 1 SKU lên 1 gian hàng' })).toBeTruthy();
  });

  it('push-preview lỗi: báo chưa kiểm được và tính tạm như cũ', () => {
    preview.result = [{ data: undefined, isError: true, isLoading: false, error: new Error('x'), refetch: vi.fn() }];
    renderPreview();
    expect(screen.getByText(/Chưa kiểm được trước khi đăng/)).toBeTruthy();
    expect(screen.getAllByText(/Chưa đăng: Còn thiếu thông tin của sàn/)).toHaveLength(2);
  });

  it('đang kiểm: chưa cho đăng', () => {
    preview.result = [{ data: undefined, isError: false, isLoading: true }];
    renderPreview();
    expect(screen.getAllByText('Đang kiểm…')).toHaveLength(2);
    expect((screen.getByRole('button', { name: /Đang kiểm trước khi đăng/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
