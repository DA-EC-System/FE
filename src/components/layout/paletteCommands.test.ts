import { describe, expect, it } from 'vitest';
import type { CompanyContext } from '@/types/auth';
import { filterCommands, foldVi, matchRange, pageCommands, quickActions } from './paletteCommands';
import { companyNav } from './navigation';

const C = 'cmp-001';
const pages = pageCommands(companyNav(C));
const labels = (q: string) => filterCommands(pages, q).map((c) => c.label);

const ctx = (permissions: string[], enabledModules: CompanyContext['enabledModules']): CompanyContext => ({
  companyId: C,
  companyName: 'ABC',
  roles: [],
  permissions,
  enabledModules,
});

describe('foldVi', () => {
  it('bỏ dấu, đ thành d, giữ độ dài', () => {
    expect(foldVi('Đối soát sàn')).toBe('doi soat san');
    expect(foldVi('Kho').length).toBe(3);
    expect(foldVi('Yêu cầu trả')).toHaveLength('Yêu cầu trả'.length);
  });
});

describe('matchRange', () => {
  it('gõ có dấu hay không dấu đều khớp, trả vị trí trên chuỗi gốc', () => {
    expect(matchRange('Đối soát sàn', 'doi soat')).toEqual([0, 8]);
    expect(matchRange('Đối soát sàn', 'SÀN')).toEqual([9, 12]);
    expect(matchRange('Kho', 'đơn')).toBeNull();
    expect(matchRange('Kho', '  ')).toBeNull();
  });
});

describe('filterCommands', () => {
  it('"kho" đưa trang Kho lên đầu', () => {
    expect(labels('kho')[0]).toBe('Kho');
  });

  it('khớp đầu chữ trước khớp giữa chữ, khớp tên nhóm sau cùng', () => {
    const r = labels('don');
    expect(r[0]).toBe('Đơn hàng');
    // "Kiện hàng" chỉ khớp tên nhóm "Đơn hàng" nên đứng sau mọi mục khớp tên
    expect(r.indexOf('Kiện hàng')).toBe(r.length - 2);
    expect(r.slice(-2)).toEqual(['Kiện hàng', 'Yêu cầu trả']);
    // Khách hàng, Báo cáo kinh doanh ngoài MVP: không còn trong menu nên không còn trong Ctrl K (FE#249)
    expect(labels('khach hang')).toEqual([]);
    expect(labels('bao cao')).toEqual([]);
  });

  it('chữ rỗng giữ nguyên danh sách', () => {
    expect(filterCommands(pages, ' ')).toBe(pages);
  });
});

describe('pageCommands', () => {
  it('mỗi mục menu một lệnh, ghi tên nhóm khi khác tên mục', () => {
    const kho = pages.find((p) => p.label === 'Kho');
    expect(kho).toMatchObject({ to: `/c/${C}/inventory`, hint: 'Sản phẩm và kho' });
    expect(pages.find((p) => p.to === `/c/${C}/sales/orders`)?.hint).toBeUndefined();
  });
});

describe('quickActions', () => {
  it('chỉ thao tác có quyền và phân hệ đang bật', () => {
    expect(quickActions(null)).toEqual([]);
    const all = quickActions(
      ctx(
        ['sales.order.create', 'purchasing.request.manage', 'catalog.product.manage', 'channel.shop.connect'],
        ['sales', 'purchasing', 'catalog', 'channel'],
      ),
    );
    // Không còn "Tạo đơn": đơn tạo tay ngoài MVP (FE#249)
    expect(all.map((a) => a.label)).toEqual(['Tạo đề nghị nhập', 'Thêm sản phẩm', 'Thêm gian hàng']);
    expect(all.find((a) => a.id === 'shop-new')).toMatchObject({ to: `/c/${C}/channel/shops`, state: { addShop: true } });

    const noPurchasing = quickActions(ctx(['catalog.product.manage', 'purchasing.request.manage'], ['catalog']));
    expect(noPurchasing.map((a) => a.label)).toEqual(['Thêm sản phẩm']);
  });
});
