// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PushPreviewRow } from '@/types/blocker';
import { PushPreviewDialog, type PushPreviewTarget } from './PushPreviewDialog';

const preview = vi.hoisted(() => ({ result: undefined as unknown, calls: [] as unknown[][] }));
vi.mock('@/api/readiness.api', () => ({
  usePushPreview: (...args: unknown[]) => {
    preview.calls.push(args);
    return preview.result;
  },
}));

const row = (variantId: string, over: Partial<PushPreviewRow> = {}): PushPreviewRow => ({
  variantId,
  productId: 'p1',
  productName: 'Áo thun',
  attributesLabel: 'Đỏ',
  sku: `AO-${variantId}`,
  status: 'ready',
  blockers: [],
  listPrice: 120000,
  rounding: null,
  stockToPush: 5,
  stockHeldReason: null,
  netReceived: 96000,
  feePct: 0.2,
  feeConfigId: 'f1',
  ...over,
});
const targets: PushPreviewTarget[] = [
  { variantId: 'v1', isNew: true },
  { variantId: 'v2', isNew: false },
];

const renderDialog = (onConfirm = vi.fn(), can = { product: true, finance: false }) =>
  render(
    <MemoryRouter>
      <PushPreviewDialog
        targets={targets}
        shopId="s1"
        companyId="c1"
        platform="lazada"
        shopLabel="Đùi Gà Store"
        can={can}
        saving={false}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    </MemoryRouter>,
  );

beforeEach(() => {
  preview.calls = [];
});
afterEach(cleanup);

describe('PushPreviewDialog: Đăng bán N SKU đi qua xem trước (FE#461)', () => {
  it('kiểm mọi SKU; nút xác nhận chỉ gồm SKU đăng được; SKU bị chặn có lý do và chỗ sửa theo quyền', () => {
    preview.result = {
      data: [
        row('v1'),
        row('v2', {
          status: 'blocked',
          blockers: [
            { code: 'weight_missing', label: 'Thiếu cân nặng', scope: 'common', target: { kind: 'variant_field', field: 'weight' }, variantIds: ['v2'] },
            { code: 'fee_not_configured', label: 'Gian hàng chưa cài phí sàn', scope: 'shop', target: { kind: 'shop', field: 'fee_config' }, variantIds: [] },
          ],
        }),
      ],
      isLoading: false,
      isError: false,
      isPlaceholderData: false,
    };
    const onConfirm = vi.fn();
    renderDialog(onConfirm);
    expect(preview.calls.at(-1)).toEqual(['s1', ['v1', 'v2']]);
    expect(screen.getByText(/1 SKU đăng được, 1 SKU bị chặn/)).toBeTruthy();
    expect(screen.getByText(/1 SKU chưa có trên sàn sẽ được tạo/)).toBeTruthy();
    expect(screen.getByText('Sẽ đăng sản phẩm mới')).toBeTruthy();
    const blockers = screen.getByTestId('push-preview-blockers');
    expect(blockers.textContent).toContain('Chưa đăng: Thiếu cân nặng');
    expect(blockers.textContent).toContain('Chưa đăng: Gian hàng chưa cài phí sàn');
    // Không có quyền tài chính: chỉ còn nút sửa cân nặng
    const fixes = screen.getAllByTestId('push-preview-fix');
    expect(fixes).toHaveLength(1);
    expect(fixes[0]!.getAttribute('href')).toBe('/c/c1/catalog/products/p1?spec=v2&field=weightG');
    fireEvent.click(screen.getByRole('button', { name: 'Đăng 1 SKU' }));
    expect(onConfirm).toHaveBeenCalledWith(['v1']);
  });

  it('đang kiểm hoặc đang hiện kết quả cũ: chưa cho đăng', () => {
    preview.result = { data: [row('v1')], isLoading: false, isError: false, isPlaceholderData: true };
    renderDialog();
    expect((screen.getByRole('button', { name: 'Đang kiểm trước khi đăng…' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('kiểm lỗi: không đăng, có nút kiểm lại', () => {
    const refetch = vi.fn();
    preview.result = { data: undefined, isLoading: false, isError: true, isPlaceholderData: false, error: new Error('x'), refetch };
    renderDialog();
    expect(screen.getByText('Chưa kiểm được trước khi đăng.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm lại' }));
    expect(refetch).toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Đăng 0 SKU' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('mọi SKU bị chặn: không có gì để đăng', () => {
    preview.result = { data: [row('v1', { status: 'blocked' }), row('v2', { status: 'blocked' })], isLoading: false, isError: false, isPlaceholderData: false };
    renderDialog();
    expect((screen.getByRole('button', { name: 'Đăng 0 SKU' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText('Chưa đăng được')).toHaveLength(2);
  });
});
