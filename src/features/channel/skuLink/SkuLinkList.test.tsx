// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemoteProduct, RemoteProductList, RemoteSkuRow, SkuLinkSuggestion } from '@/types/setupDraft';
import { SkuLinkList } from './SkuLinkList';

const api = vi.hoisted(() => ({
  list: null as unknown,
  queries: [] as unknown[],
  apply: vi.fn(),
  save: vi.fn(),
  canCreate: true,
}));
vi.mock('@/api/setupDraft.api', () => ({
  useRemoteProducts: (_shopId: string, params: unknown) => {
    api.queries.push(params);
    return { data: api.list, isLoading: false, isError: false };
  },
  useApplySkuLinks: () => ({ mutateAsync: api.apply, isPending: false }),
  saveDraftSkuLinks: (...args: unknown[]) => api.save(...args),
}));
vi.mock('@/api/shops.api', () => ({
  useShopListings: () => ({ data: [{ variantId: 'v1', sku: 'AO-1', productName: 'Áo', attributesLabel: '' }] }),
}));
vi.mock('@/api/catalog.api', () => ({ useGroups: () => ({ data: [], isPending: false, isError: false }) }));
vi.mock('@/features/catalog/GroupCombobox', () => ({
  GroupCombobox: ({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) => (
    <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock('@/hooks/usePermission', () => ({ useCan: () => () => api.canCreate }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

const sug = (variantId: string, confidence: SkuLinkSuggestion['confidence']): SkuLinkSuggestion => ({
  variantId,
  sku: 'AO-1',
  productName: 'Áo',
  match: confidence === 'high' ? 'sku' : 'name',
  score: confidence === 'high' ? null : 0.75,
  confidence,
});
const sku = (id: string, over: Partial<RemoteSkuRow> = {}): RemoteSkuRow =>
  ({
    externalSkuId: id,
    sellerSku: id.toUpperCase(),
    title: 'Áo thun',
    variantLabel: null,
    platformStock: 3,
    matchedVariantId: null,
    canCreate: true,
    cannotCreateReason: null,
    decision: null,
    ...over,
  }) as RemoteSkuRow;
const product = (id: string, skus: RemoteSkuRow[]): RemoteProduct => ({
  externalProductId: id,
  title: `Sản phẩm ${id}`,
  titleEn: null,
  imageUrl: null,
  externalCategoryId: null,
  suggestedGroupId: 'g1',
  skus,
});
const listOf = (items: RemoteProduct[]): RemoteProductList =>
  ({ items, total: items.length, page: 1, pageSize: 20, counts: { unlinked: 3, linked: 0, pending: 0 }, syncedAt: '2026-11-24T00:00:00Z' }) as RemoteProductList;

beforeEach(() => {
  api.queries = [];
  api.apply.mockReset().mockResolvedValue([{ externalSkuId: 's1', result: 'linked', variantId: 'v1', productId: null, code: null, message: null }]);
  api.save.mockReset();
  api.canCreate = true;
  api.list = listOf([product('p1', [sku('s1', { suggestion: sug('v1', 'high') }), sku('s2', { suggestion: sug('v9', 'medium') })]), product('p2', [sku('s3')])]);
});
afterEach(cleanup);

describe('SkuLinkList chế độ áp (gian hàng đang bán)', () => {
  it('hỏi SKU chưa liên kết; gợi ý kèm độ tin; Chấp nhận chỉ gom gợi ý chắc chắn', async () => {
    render(<SkuLinkList shopId="s" mode="apply" showSkip={false} onPick={vi.fn()} />);
    expect(api.queries.at(-1)).toMatchObject({ status: 'unlinked', page: 1, pageSize: 20 });
    expect(screen.getByText('Chắc chắn')).toBeTruthy();
    expect(screen.getByText('Khá giống')).toBeTruthy();
    expect(screen.getByText(/Tên gần giống 75%/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('accept-confident'));
    await waitFor(() => expect(api.apply).toHaveBeenCalled());
    expect(api.apply.mock.calls[0]![0].items).toEqual([{ externalSkuId: 's1', action: 'link', variantId: 'v1' }]);
  });

  it('gợi ý theo tên chỉ mở hộp chọn của trang, không liên kết sẵn', () => {
    const onPick = vi.fn();
    render(<SkuLinkList shopId="s" mode="apply" showSkip={false} onPick={onPick} />);
    const row = screen.getAllByTestId('sku-row')[1]!;
    expect(within(row).queryByRole('button', { name: 'Liên kết' })).toBeNull();
    fireEvent.click(within(row).getByRole('button', { name: 'Xem gợi ý' }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ externalSkuId: 's2' }));
  });

  it('chọn cả sản phẩm: thanh hàng loạt; tạo sản phẩm kho gửi groups theo sản phẩm sàn', async () => {
    api.apply.mockResolvedValue([]);
    render(<SkuLinkList shopId="s" mode="apply" showSkip={false} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Chọn mọi SKU của Sản phẩm p1' }));
    const bar = screen.getByTestId('sku-bulk-bar');
    expect(within(bar).getByText('Liên kết 2 SKU theo gợi ý')).toBeTruthy();
    fireEvent.click(within(bar).getByRole('button', { name: 'Tạo sản phẩm kho từ 2 SKU' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tạo và liên kết' }));
    await waitFor(() => expect(api.apply).toHaveBeenCalled());
    const arg = api.apply.mock.calls[0]![0];
    expect(arg.items.map((i: { action: string }) => i.action)).toEqual(['create', 'create']);
    expect(arg.groups).toEqual([{ externalProductId: 'p1', groupId: 'g1' }]);
    expect(arg.productOf('s2')).toBe('p1');
  });

  it('không có quyền sửa sản phẩm thì không có nút tạo', () => {
    api.canCreate = false;
    render(<SkuLinkList shopId="s" mode="apply" showSkip={false} />);
    expect(screen.queryByRole('button', { name: 'Tạo SKU kho mới' })).toBeNull();
  });
});

describe('SkuLinkList chế độ nháp (thiết lập)', () => {
  it('hỏi mọi SKU; bộ đếm đọc từ nháp; bỏ qua hàng loạt ghi nháp với draftVersion, 409 gọi onConflict', async () => {
    api.save.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 409, data: { status: 409, code: 'version_conflict', current: { draft: { decisions: [] }, draftVersion: 9 } } },
    });
    const onConflict = vi.fn();
    const onDraftSaved = vi.fn();
    render(
      <SkuLinkList
        shopId="s"
        mode="draft"
        draftVersion={4}
        draft={{ decisions: [{ externalSkuId: 's1', action: 'link', variantId: 'v1' }] } as never}
        onDraftSaved={onDraftSaved}
        onConflict={onConflict}
        showSkip
      />,
    );
    expect(api.queries.at(-1)).toMatchObject({ status: 'all' });
    expect(screen.getByTestId('decision-counts').textContent).toContain('Đã liên kết 1');
    expect(screen.getByTestId('decision-counts').textContent).toContain('Chưa chọn 2');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Chọn SKU S3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ qua 1 SKU' }));
    await waitFor(() => expect(api.save).toHaveBeenCalledWith('s', [{ externalSkuId: 's3', action: 'skip', variantId: null }], 4));
    await waitFor(() => expect(onConflict).toHaveBeenCalled());
    expect(onDraftSaved).toHaveBeenCalledWith({ decisions: [] }, 9);
  });
});
