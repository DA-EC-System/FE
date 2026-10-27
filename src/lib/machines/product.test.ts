import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@/utils/permissions';
import type { VariantMainLabel } from '@/types/catalog';
import { mainLabel, parentLabel, purchasable, variantMachine } from './product';

const actor = { accountId: 'a1', permissions: [PERMISSIONS.productManage] };
const free = { archiveBlockers: [] };
const counts = (over: Partial<Record<VariantMainLabel, number>>): Record<VariantMainLabel, number> => ({
  archived: 0,
  discontinued: 0,
  paused: 0,
  live: 0,
  pending: 0,
  not_listed: 0,
  ...over,
});

describe('Trạng thái kinh doanh SKU (sơ đồ B1)', () => {
  it('đi đúng các mũi tên của sơ đồ', () => {
    expect(variantMachine.check('selling', 'pause', { actor })).toEqual({ ok: true, to: 'paused' });
    expect(variantMachine.check('paused', 'discontinue', { actor })).toEqual({ ok: true, to: 'discontinued' });
    expect(variantMachine.check('discontinued', 'pause', { actor })).toEqual({ ok: true, to: 'paused' });
    expect(variantMachine.check('archived', 'restore', { actor })).toEqual({ ok: true, to: 'discontinued' });
  });

  it('chỉ lưu trữ từ Ngừng nhập, và chỉ khi không còn lý do chặn', () => {
    expect(variantMachine.check('selling', 'archive', { actor, record: free })).toEqual({ ok: false, code: 'invalid_transition' });
    expect(variantMachine.check('discontinued', 'archive', { actor, record: { archiveBlockers: ['Còn 3 tồn thực'] } })).toEqual({
      ok: false,
      code: 'archive_blocked',
    });
    expect(variantMachine.check('discontinued', 'archive', { actor, record: free })).toEqual({ ok: true, to: 'archived' });
  });

  it('cần quyền quản lý sản phẩm', () => {
    expect(variantMachine.check('selling', 'pause', { actor: { accountId: 'a1', permissions: [] } })).toEqual({
      ok: false,
      code: 'forbidden',
    });
  });

  it('ngừng nhập và lưu trữ không nhập thêm được', () => {
    expect(['selling', 'paused', 'discontinued', 'archived'].map((s) => purchasable(s as never))).toEqual([true, true, false, false]);
  });
});

describe('Nhãn (sơ đồ B1)', () => {
  it('nhãn chính: trạng thái kinh doanh đè hiện diện; Có lỗi chỉ là nhãn phụ', () => {
    expect(mainLabel('paused', 'live')).toBe('paused');
    expect(mainLabel('selling', 'pending')).toBe('pending');
    expect(mainLabel('selling', 'error')).toBe('live');
  });

  it('nhãn cha suy từ con, không tính SKU đã lưu trữ', () => {
    expect(parentLabel(counts({ live: 4, paused: 1, discontinued: 1, archived: 2 }))).toEqual({ label: 'live', text: 'Đang bán 4/6' });
    expect(parentLabel(counts({ live: 2 }))).toEqual({ label: 'live', text: 'Đang bán' });
    expect(parentLabel(counts({ not_listed: 1, discontinued: 2 }))).toEqual({ label: 'discontinued', text: 'Ngừng nhập 2/3' });
    expect(parentLabel(counts({ archived: 3 }))).toEqual({ label: 'archived', text: 'Lưu trữ' });
  });
});
