/**
 * Dữ liệu giả catalog.* và files.files theo ERD. Chỉ dùng cho MSW.
 * SKU sinh bằng utils/sku.ts giống màn hình xem trước.
 */

import { renderSku, valueCode } from '@/utils/sku';
import type { SuggestConfig, VariantBusinessStatus } from '@/types/catalog';

/** product.product_groups (Documents/21 §5.2, FE#350): nhóm hàng một cấp, `suggest` null là theo công ty */
export interface MockGroup {
  id: string;
  companyId: string;
  name: string;
  suggest: SuggestConfig;
  version: number;
  updatedAt: string;
}

/** Mẫu SKU và bộ đếm: của công ty (`company_product_settings`) hoặc mẫu cũ dùng khi seed */
export interface SkuCounter {
  skuPattern: string;
  skuNextSeq: number;
}

/** product.company_product_settings */
export interface MockProductSettings extends SkuCounter {
  companyId: string;
  suggest: SuggestConfig;
  version: number;
}

export interface MockAttribute {
  id: string;
  companyId: string;
  name: string;
  /** Thuộc tính chuẩn sàn, hệ thống tạo khi lập công ty */
  platformKind: 'color' | 'size' | null;
  /** code: mã dùng trong {VAL} của SKU (D27, docs/21 V21) */
  values: { id: string; value: string; code: string }[];
  version: number;
}

export interface MockVariant {
  id: string;
  sku: string;
  valueIds: string[];
  /** Có giá trị khi `businessStatus = archived` */
  archivedAt: string | null;
  /** Sơ đồ Sản phẩm (B1): SKU mới luôn `selling` */
  businessStatus: VariantBusinessStatus;
}

export interface MockProduct {
  id: string;
  companyId: string;
  groupId: string;
  name: string;
  description: string;
  /** catalog.product_images theo position */
  imageFileIds: string[];
  /** catalog.products.size_chart_file_id */
  sizeChartFileId?: string | null;
  /** Xuất xứ (ISO alpha-2), thương hiệu: dùng chung mọi sàn (Documents/21 §17.2, commerio-backend#340) */
  originCountry?: string | null;
  brand?: string | null;
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
export function swatch(color: string, text: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="${color}"/><text x="120" y="132" font-family="sans-serif" font-size="28" fill="#fff" text-anchor="middle">${text}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const T0 = '2026-08-20T03:00:00.000Z';

export const NO_SUGGEST: SuggestConfig = {
  marginCoefficient: null,
  priceRounding: null,
  reorderLeadDays: null,
  reorderSafetyQty: null,
  reorderDefaultQty: null,
};

const group = (id: string, companyId: string, name: string): MockGroup => ({
  id,
  companyId,
  name,
  suggest: { ...NO_SUGGEST },
  version: 1,
  updatedAt: T0,
});

// Giữ id "cat-*" của danh mục cũ: staging đổi tên danh mục có sẵn thành nhóm, giữ nguyên (thiết kế FE#350 mục 3)
export const groups: MockGroup[] = [
  group('cat-ao', 'cmp-001', 'Áo'),
  group('cat-quan', 'cmp-001', 'Quần'),
  group('cat-pk', 'cmp-001', 'Phụ kiện'),
  group('cat-vo', 'cmp-001', 'Vớ'),
  // Chỉ còn sản phẩm đã lưu trữ: vẫn không xoá được (V25)
  group('cat-somi', 'cmp-001', 'Sơ mi'),
  group('cat-mp-gao', 'cmp-002', 'Gạo'),
];

/** Mặc định `SP{SEQ:5}-{VAL}` (thiết kế FE#350 D3) */
export const productSettings: MockProductSettings[] = [
  { companyId: 'cmp-001', skuPattern: 'SP{SEQ:5}-{VAL}', skuNextSeq: 1, suggest: { ...NO_SUGGEST, marginCoefficient: 1.4, priceRounding: 1000 }, version: 1 },
  { companyId: 'cmp-002', skuPattern: 'SP{SEQ:5}-{VAL}', skuNextSeq: 1, suggest: { ...NO_SUGGEST }, version: 1 },
];

/** Cài đặt của công ty; công ty mới tạo trong mock thì thêm bản mặc định */
export function settingsOf(companyId: string): MockProductSettings {
  let s = productSettings.find((x) => x.companyId === companyId);
  if (!s) {
    s = { companyId, skuPattern: 'SP{SEQ:5}-{VAL}', skuNextSeq: 1, suggest: { ...NO_SUGGEST }, version: 1 };
    productSettings.push(s);
  }
  return s;
}

/** SKU seed sinh theo quy tắc danh mục cũ: SKU đã có giữ nguyên khi đổi sang mẫu công ty (D3) */
const LEGACY_PATTERNS: Record<string, SkuCounter> = {
  'cat-ao': { skuPattern: 'AO-{SEQ:4}-{VAL}', skuNextSeq: 1 },
  'cat-quan': { skuPattern: 'QU-{SEQ:4}-{VAL}', skuNextSeq: 1 },
  'cat-pk': { skuPattern: 'PK-{SEQ:4}', skuNextSeq: 1 },
  'cat-somi': { skuPattern: 'SM-{SEQ:3}-{VAL}', skuNextSeq: 1 },
  'cat-mp-gao': { skuPattern: 'GAO{SEQ:5}', skuNextSeq: 1 },
};

const v = (id: string, value: string, code = valueCode(value)) => ({ id, value, code });

export const attributes: MockAttribute[] = [
  {
    id: 'att-mau',
    companyId: 'cmp-001',
    name: 'Màu sắc',
    platformKind: 'color',
    values: [
      v('val-den', 'Đen'),
      v('val-trang', 'Trắng'),
      v('val-do', 'Đỏ'),
      v('val-navy', 'Xanh navy', 'NAVY'),
    ],
    version: 1,
  },
  {
    id: 'att-size',
    companyId: 'cmp-001',
    name: 'Kích cỡ',
    platformKind: 'size',
    values: [
      v('val-s', 'S'),
      v('val-m', 'M'),
      v('val-l', 'L'),
      v('val-xl', 'XL'),
    ],
    version: 1,
  },
  {
    id: 'att-chatlieu',
    companyId: 'cmp-001',
    name: 'Chất liệu',
    platformKind: null,
    values: [
      v('val-cotton', 'Cotton'),
      v('val-kaki', 'Kaki'),
    ],
    version: 1,
  },
  {
    id: 'att-mp-kl',
    companyId: 'cmp-002',
    name: 'Khối lượng',
    platformKind: null,
    values: [
      v('val-mp-5kg', '5kg'),
      v('val-mp-10kg', '10kg'),
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

function codeOf(id: string) {
  return attributes.flatMap((a) => a.values).find((x) => x.id === id)?.code ?? '';
}

/** Sinh biến thể theo mẫu SKU, tăng số thứ tự; dùng chung cho seed và handler */
export function makeVariant(counter: SkuCounter, valueIds: string[], id: string): MockVariant {
  const variant = {
    id,
    sku: renderSku(counter.skuPattern, counter.skuNextSeq, valueIds.map(codeOf)),
    valueIds,
    archivedAt: null,
    businessStatus: 'selling' as const,
  };
  counter.skuNextSeq += 1;
  return variant;
}

function seed(
  p: Omit<MockProduct, 'variants' | 'archivedAt' | 'version' | 'updatedAt'> & {
    combos: string[][];
    archived?: boolean;
    /** Trạng thái kinh doanh theo vị trí biến thể; không ghi là `selling` */
    statuses?: Record<number, VariantBusinessStatus>;
  },
) {
  const counter = LEGACY_PATTERNS[p.groupId]!;
  const { combos, archived, statuses = {}, ...rest } = p;
  products.push({
    ...rest,
    variants: combos.map((ids, i) => {
      const businessStatus = archived ? 'archived' : (statuses[i] ?? 'selling');
      return {
        ...makeVariant(counter, ids, `${p.id}-v${i + 1}`),
        businessStatus,
        archivedAt: businessStatus === 'archived' ? '2026-09-01T02:00:00.000Z' : null,
      };
    }),
    archivedAt: archived ? '2026-09-15T02:00:00.000Z' : null,
    updatedAt: T0,
    version: 1,
  });
}

seed({
  id: 'prd-001',
  companyId: 'cmp-001',
  groupId: 'cat-ao',
  name: 'Áo thun basic cổ tròn',
  description: 'Cotton 100%, form regular.',
  originCountry: 'VN',
  brand: 'ABC Fashion',
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
  groupId: 'cat-quan',
  name: 'Quần kaki ống suông',
  description: '',
  imageFileIds: ['fil-003'],
  combos: [['val-m'], ['val-l'], ['val-xl']],
});
seed({
  id: 'prd-003',
  companyId: 'cmp-001',
  groupId: 'cat-pk',
  name: 'Thắt lưng da bò',
  description: 'Khoá kim loại không gỉ.',
  imageFileIds: ['fil-004'],
  combos: [[]],
});
seed({
  id: 'prd-004',
  companyId: 'cmp-001',
  groupId: 'cat-somi',
  name: 'Áo sơ mi caro',
  description: '',
  imageFileIds: [],
  combos: [['val-do', 'val-m']],
  archived: true,
});
seed({
  id: 'prd-005',
  companyId: 'cmp-001',
  groupId: 'cat-ao',
  name: 'Áo polo nam',
  description: 'Vải cá sấu, cổ bẻ.',
  imageFileIds: [],
  combos: [
    ['val-den', 'val-m'],
    ['val-den', 'val-l'],
    ['val-trang', 'val-m'],
    ['val-do', 'val-l'],
  ],
  // Đen L tạm ngừng, Trắng M ngừng nhập, Đỏ L đã lưu trữ
  statuses: { 1: 'paused', 2: 'discontinued', 3: 'archived' },
});
seed({
  id: 'prd-006',
  companyId: 'cmp-001',
  groupId: 'cat-ao',
  name: 'Áo khoác gió',
  description: '',
  imageFileIds: [],
  combos: [
    ['val-navy', 'val-m'],
    ['val-navy', 'val-l'],
    ['val-navy', 'val-xl'],
    // AO-0012-DEN-XL như dòng đầu bảng 9.1
    ['val-den', 'val-xl'],
  ],
});
seed({
  id: 'prd-101',
  companyId: 'cmp-002',
  groupId: 'cat-mp-gao',
  name: 'Gạo ST25',
  description: '',
  imageFileIds: ['fil-005'],
  combos: [['val-mp-5kg'], ['val-mp-10kg']],
});

/** Hàng về SKU đã lưu trữ (khách trả, nhà cung cấp bù): SKU quay về Ngừng nhập, cha hiện lại (sơ đồ B1 "khôi phục / hàng về") */
export function reviveOnArrival(variantId: string) {
  for (const p of products) {
    const v = p.variants.find((x) => x.id === variantId);
    if (v?.businessStatus !== 'archived') continue;
    v.businessStatus = 'discontinued';
    v.archivedAt = null;
    p.archivedAt = null;
  }
}
