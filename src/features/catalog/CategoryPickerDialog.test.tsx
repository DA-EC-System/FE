// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductDetail } from '@/types/catalog';
import type { ProductSpec } from '@/types/shop';
import { CategoryPickerDialog } from './CategoryPickerDialog';

const save = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
vi.mock('@/api/shops.api', () => ({ useSaveProductSpec: () => save }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
// Cây category thật gọi API: thay bằng hai nút chọn
vi.mock('@/features/channel/push/CategoryStep', () => ({
  CategoryStep: ({ onPick }: { onPick: (c: { externalId: string; path: string }) => void }) => (
    <div>
      <button type="button" onClick={() => onPick({ externalId: 'c-cu', path: 'Cũ' })}>
        Chọn cũ
      </button>
      <button type="button" onClick={() => onPick({ externalId: 'c-moi', path: 'Mới' })}>
        Chọn mới
      </button>
    </div>
  ),
}));

const product = { id: 'p1', name: 'Quạt', variants: [] } as unknown as ProductDetail;
const spec = { externalCategoryId: 'c-cu', categoryPath: 'Cũ', attributes: {}, axisMap: {}, valueMap: {}, version: 3 } as unknown as ProductSpec;

const loi422 = (errors: Record<string, string>) =>
  new AxiosError('422', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 422,
    data: { type: 'about:blank', title: 'Dữ liệu không hợp lệ', status: 422, code: 'validation_failed', detail: 'Dữ liệu không hợp lệ', errors },
  } as unknown as AxiosResponse);

const ve = (props: Partial<Parameters<typeof CategoryPickerDialog>[0]> = {}) =>
  render(
    <CategoryPickerDialog
      open
      onOpenChange={vi.fn()}
      companyId="co1"
      product={product}
      platform="lazada"
      label="Lazada"
      shopId="s1"
      spec={spec}
      pathIds={null}
      dirty={false}
      {...props}
    />,
  );

const nutLuu = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Lưu category' });

beforeEach(() => {
  save.mutateAsync.mockReset();
});
afterEach(cleanup);

describe('CategoryPickerDialog', () => {
  it('chưa đổi category thì nút Lưu tắt, lý do nằm cạnh nút và nối qua aria-describedby', () => {
    ve();
    expect(nutLuu().disabled).toBe(true);
    const lyDo = screen.getByText('Chọn category khác để lưu');
    expect(nutLuu().getAttribute('aria-describedby')).toBe(lyDo.id);
    fireEvent.click(screen.getByRole('button', { name: 'Chọn mới' }));
    expect(nutLuu().disabled).toBe(false);
    expect(screen.queryByText('Chọn category khác để lưu')).toBeNull();
    expect(nutLuu().hasAttribute('aria-describedby')).toBe(false);
  });

  it('BE trả 422 có errors: hiện từng câu lỗi trong hộp, không chỉ toast; đổi category thì xoá lỗi', async () => {
    save.mutateAsync.mockRejectedValue(
      loi422({ 'attributes.isbn_issn': 'Nhập ISBN ISSN', 'axisMap.a1': 'Chọn thuộc tính phân loại của sàn cho Công suất' }),
    );
    ve();
    fireEvent.click(screen.getByRole('button', { name: 'Chọn mới' }));
    fireEvent.click(nutLuu());
    expect(await screen.findByText('Nhập ISBN ISSN')).toBeTruthy();
    expect(screen.getByText('Chọn thuộc tính phân loại của sàn cho Công suất')).toBeTruthy();
    expect(screen.getByText(/Chưa lưu được category/)).toBeTruthy();
    expect(toast.error).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Chọn cũ' }));
    expect(screen.queryByText('Nhập ISBN ISSN')).toBeNull();
  });

  it('lỗi không có errors thì hiện câu lỗi chung trong hộp', async () => {
    save.mutateAsync.mockRejectedValue(new Error('mạng'));
    ve();
    fireEvent.click(screen.getByRole('button', { name: 'Chọn mới' }));
    fireEvent.click(nutLuu());
    expect(await screen.findByText(/Chưa lưu được category\./)).toBeTruthy();
  });

  it('lưu xong còn thiếu: toast số mục thiếu, đóng hộp, báo trang để đưa tới phần Attribute', async () => {
    const missing = [{ code: 'isbn_issn', label: 'ISBN ISSN', reason: 'required' }];
    save.mutateAsync.mockResolvedValue({ spec: { ...spec, externalCategoryId: 'c-moi' }, missing });
    const onOpenChange = vi.fn();
    const onSavedWithMissing = vi.fn();
    ve({ onOpenChange, onSavedWithMissing });
    fireEvent.click(screen.getByRole('button', { name: 'Chọn mới' }));
    fireEvent.click(nutLuu());
    await waitFor(() => expect(onSavedWithMissing).toHaveBeenCalledWith(missing));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toast.success).toHaveBeenCalledWith('Đã lưu category Lazada. Còn thiếu 1 mục.');
  });

  it('câu "đang có trên sàn" chỉ hiện khi listed', () => {
    ve({ listed: false });
    fireEvent.click(screen.getByRole('button', { name: 'Chọn mới' }));
    expect(screen.queryByText(/Sản phẩm đang có trên Lazada/)).toBeNull();
    cleanup();
    ve({ listed: true });
    fireEvent.click(screen.getByRole('button', { name: 'Chọn mới' }));
    expect(screen.getByText(/Sản phẩm đang có trên Lazada/)).toBeTruthy();
  });
});
