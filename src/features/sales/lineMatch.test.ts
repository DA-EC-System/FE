import { describe, expect, it } from 'vitest';
import type { RemoteSku } from '@/types/shop';
import { REMAP_UNLOAD_NOTE, isUnmappedLine, lineMatchToast, needsUnload, pendingTargetLabel, remoteSkuOf } from './lineMatch';

const remote = (externalSkuId: string, sellerSku: string) => ({ externalSkuId, sellerSku }) as RemoteSku;

describe('lineMatch (FE#283)', () => {
  it('dòng chưa ghép: có SKU sàn, không biến thể, không "không quản tồn"', () => {
    expect(isUnmappedLine({ externalSku: 'OLD-TEE-01', variantId: null, untracked: false })).toBe(true);
    expect(isUnmappedLine({ externalSku: 'OLD-TEE-01', variantId: null, untracked: true })).toBe(false);
    expect(isUnmappedLine({ externalSku: 'OLD-TEE-01', variantId: 'v1', untracked: false })).toBe(false);
    expect(isUnmappedLine({ externalSku: null, variantId: null, untracked: false })).toBe(false);
  });

  it('tìm SKU sàn theo sku_id trước, rồi theo SKU người bán', () => {
    const items = [remote('s-1', 'A'), remote('s-2', 'B')];
    expect(remoteSkuOf(items, { externalSkuId: 's-2', externalSku: 'A' })?.externalSkuId).toBe('s-2');
    expect(remoteSkuOf(items, { externalSkuId: null, externalSku: 'A' })?.externalSkuId).toBe('s-1');
    expect(remoteSkuOf(items, { externalSkuId: 's-9', externalSku: 'Z' })).toBeUndefined();
    expect(remoteSkuOf(undefined, { externalSkuId: 's-1', externalSku: 'A' })).toBeUndefined();
  });

  it('kiện cần dỡ về kệ: Cần xử lý kèm ghi chú đổi ghép', () => {
    expect(needsUnload({ flags: ['needs_attention'], flagNote: REMAP_UNLOAD_NOTE })).toBe(true);
    expect(needsUnload({ flags: ['needs_attention'], flagNote: 'Sàn báo lỗi' })).toBe(false);
    expect(needsUnload({ flags: [], flagNote: REMAP_UNLOAD_NOTE })).toBe(false);
  });

  it('câu báo theo kết quả ghép', () => {
    expect(lineMatchToast('OLD', 'AT-01', false)).toBe('Đã ghép OLD với AT-01. Đơn đã nhận của SKU này trong gian hàng cũng được ghép.');
    expect(lineMatchToast('OLD', null, false)).toBe('Đã đặt SKU sàn OLD là không quản tồn');
    expect(lineMatchToast('OLD', null, true)).toBe('Đã gửi CEO duyệt ghép SKU sàn OLD. Đơn giữ cờ Chưa ghép SKU tới khi CEO duyệt.');
  });

  it('đích của ghép chờ', () => {
    const p = { variantId: null, externalSkuId: null, requestedBy: { id: 'a', name: 'Sale' }, requestedAt: '' };
    expect(pendingTargetLabel(p, () => 'X')).toBe('Không quản tồn');
    expect(pendingTargetLabel({ ...p, variantId: 'v1' }, () => 'AT-01')).toBe('AT-01');
    expect(pendingTargetLabel({ ...p, variantId: 'v1' }, () => undefined)).toBe('biến thể khác');
  });
});
