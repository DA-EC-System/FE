/**
 * Dữ liệu giả catalog.* và files.files theo ERD. Chỉ dùng cho MSW.
 * SKU sinh bằng utils/sku.ts giống màn hình xem trước.
 */

import { renderSku } from '@/utils/sku';

export interface MockCategory {
  id: string;
  companyId: string;
  name: string;
  skuPattern: string;
  skuNextSeq: number;
  version: number;
  updatedAt: string;
}

export interface MockAttribute {
  id: string;
  companyId: string;
  name: string;
  values: { id: string; value: string }[];
  version: number;
}

export interface MockVariant {
  id: string;
  sku: string;
  valueIds: string[];
  archivedAt: string | null;
}

export interface MockProduct {
  id: string;
  companyId: string;
  categoryId: string;
  name: string;
  description: string;
  /** catalog.product_images theo position */
  imageFileIds: string[];
  variants: MockVariant[];
  archivedAt: string | null;
  updatedAt: string;
  version: number;
}

export interface MockFile {
  id: string;
  companyId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  /** null: đã cấp vé nhưng chưa tải xong */
  url: string | null;
}

/** Ảnh giả: ô màu có chữ, để danh sách có ảnh đại diện */
function swatch(color: string, text: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="${color}"/><text x="120" y="132" font-family="sans-serif" font-size="28" fill="#fff" text-anchor="middle">${text}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const T0 = '2026-08-20T03:00:00.000Z';

export const categories: MockCategory[] = [
  { id: 'cat-ao', companyId: 'cmp-001', name: 'Áo', skuPattern: 'AO-{SEQ:4}-{VAL}', skuNextSeq: 1, version: 1, updatedAt: T0 },
  { id: 'cat-quan', companyId: 'cmp-001', name: 'Quần', skuPattern: 'QU-{SEQ:4}-{VAL}', skuNextSeq: 1, version: 1, updatedAt: T0 },
  { id: 'cat-pk', companyId: 'cmp-001', name: 'Phụ kiện', skuPattern: 'PK-{SEQ:4}', skuNextSeq: 1, version: 1, updatedAt: T0 },
  { id: 'cat-vo', companyId: 'cmp-001', name: 'Vớ', skuPattern: 'VO-{SEQ:3}-{VAL}', skuNextSeq: 1, version: 1, updatedAt: T0 },
  { id: 'cat-mp-gao', companyId: 'cmp-002', name: 'Gạo', skuPattern: 'GAO{SEQ:5}', skuNextSeq: 1, version: 1, updatedAt: T0 },
];

export const attributes: MockAttribute[] = [
  {
    id: 'att-mau',
    companyId: 'cmp-001',
    name: 'Màu sắc',
    values: [
      { id: 'val-den', value: 'Đen' },
      { id: 'val-trang', value: 'Trắng' },
      { id: 'val-do', value: 'Đỏ' },
      { id: 'val-navy', value: 'Xanh navy' },
    ],
    version: 1,
  },
  {
    id: 'att-size',
    companyId: 'cmp-001',
    name: 'Kích cỡ',
    values: [
      { id: 'val-s', value: 'S' },
      { id: 'val-m', value: 'M' },
      { id: 'val-l', value: 'L' },
      { id: 'val-xl', value: 'XL' },
    ],
    version: 1,
  },
  {
    id: 'att-chatlieu',
    companyId: 'cmp-001',
    name: 'Chất liệu',
    values: [
      { id: 'val-cotton', value: 'Cotton' },
      { id: 'val-kaki', value: 'Kaki' },
    ],
    version: 1,
  },
  {
    id: 'att-mp-kl',
    companyId: 'cmp-002',
    name: 'Khối lượng',
    values: [
      { id: 'val-mp-5kg', value: '5kg' },
      { id: 'val-mp-10kg', value: '10kg' },
    ],
    version: 1,
  },
];

export const files: MockFile[] = [
  { id: 'fil-001', companyId: 'cmp-001', fileName: 'ao-thun-den.png', contentType: 'image/svg+xml', sizeBytes: 900, url: swatch('#263238', 'Áo thun') },
  { id: 'fil-002', companyId: 'cmp-001', fileName: 'ao-thun-trang.png', contentType: 'image/svg+xml', sizeBytes: 900, url: swatch('#90a4ae', 'Mặt sau') },
  { id: 'fil-003', companyId: 'cmp-001', fileName: 'quan-kaki.png', contentType: 'image/svg+xml', sizeBytes: 900, url: swatch('#8d6e63', 'Quần kaki') },
  { id: 'fil-004', companyId: 'cmp-001', fileName: 'that-lung.png', contentType: 'image/svg+xml', sizeBytes: 900, url: swatch('#4e342e', 'Thắt lưng') },
  { id: 'fil-005', companyId: 'cmp-002', fileName: 'gao-st25.png', contentType: 'image/svg+xml', sizeBytes: 900, url: swatch('#7cb342', 'ST25') },
];

export const products: MockProduct[] = [];

/** Sản phẩm còn đơn hàng đang xử lý: không xoá được (UC-CP-02 ngoại lệ bước 11) */
export const productsWithActiveOrders = new Set<string>(['prd-001']);

function valueName(id: string) {
  return attributes.flatMap((a) => a.values).find((v) => v.id === id)?.value ?? '';
}

/** Sinh biến thể theo quy tắc của danh mục, tăng số thứ tự; dùng chung cho seed và handler */
export function makeVariant(category: MockCategory, valueIds: string[], id: string): MockVariant {
  const variant = {
    id,
    sku: renderSku(category.skuPattern, category.skuNextSeq, valueIds.map(valueName)),
    valueIds,
    archivedAt: null,
  };
  category.skuNextSeq += 1;
  return variant;
}

function seed(
  p: Omit<MockProduct, 'variants' | 'archivedAt' | 'version' | 'updatedAt'> & {
    combos: string[][];
    archived?: boolean;
  },
) {
  const category = categories.find((c) => c.id === p.categoryId)!;
  const { combos, archived, ...rest } = p;
  products.push({
    ...rest,
    variants: combos.map((ids, i) => makeVariant(category, ids, `${p.id}-v${i + 1}`)),
    archivedAt: archived ? '2026-09-15T02:00:00.000Z' : null,
    updatedAt: T0,
    version: 1,
  });
}

seed({
  id: 'prd-001',
  companyId: 'cmp-001',
  categoryId: 'cat-ao',
  name: 'Áo thun basic cổ tròn',
  description: 'Cotton 100%, form regular.',
  imageFileIds: ['fil-001', 'fil-002'],
  combos: [
    ['val-den', 'val-m'],
    ['val-den', 'val-l'],
    ['val-trang', 'val-m'],
    ['val-trang', 'val-l'],
  ],
});
seed({
  id: 'prd-002',
  companyId: 'cmp-001',
  categoryId: 'cat-quan',
  name: 'Quần kaki ống suông',
  description: '',
  imageFileIds: ['fil-003'],
  combos: [['val-m'], ['val-l'], ['val-xl']],
});
seed({
  id: 'prd-003',
  companyId: 'cmp-001',
  categoryId: 'cat-pk',
  name: 'Thắt lưng da bò',
  description: 'Khoá kim loại không gỉ.',
  imageFileIds: ['fil-004'],
  combos: [[]],
});
seed({
  id: 'prd-004',
  companyId: 'cmp-001',
  categoryId: 'cat-ao',
  name: 'Áo sơ mi caro (ngừng bán)',
  description: '',
  imageFileIds: [],
  combos: [['val-do', 'val-m']],
  archived: true,
});
seed({
  id: 'prd-101',
  companyId: 'cmp-002',
  categoryId: 'cat-mp-gao',
  name: 'Gạo ST25',
  description: '',
  imageFileIds: ['fil-005'],
  combos: [['val-mp-5kg'], ['val-mp-10kg']],
});
