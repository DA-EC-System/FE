/**
 * channel.platform_categories, channel.platform_category_attributes (commerio-backend#400, Documents/19 §3.3).
 * Cây và attribute lấy từ lần gọi thật Lazada, TikTok ngày 18/11/2026 (prototype `.claude/issues/backend-400/data.js`).
 * Attribute chỉ có của 3 leaf mỗi sàn; leaf khác coi như chưa lấy từ sàn.
 */

import type { CategoryPermission, PlatformAttribute, PlatformCategory, ProductSpec, SizeChartRule } from '@/types/shop';
import raw from './platformCategoryData.json';

type TreeRow = [externalId: string, parentIndex: number, name: string, isLeaf: number];
type AttrRow = [
  code: string,
  label: string,
  kind: PlatformAttribute['kind'],
  tier: PlatformAttribute['tier'],
  input: PlatformAttribute['input'],
  options: string[],
  allowCustom: number,
  required: number,
  isKey: number,
];

export type MockPlatform = 'lazada' | 'tiktok';
export const MOCK_PLATFORMS: readonly MockPlatform[] = ['lazada', 'tiktok'];

export interface MockPlatformCategory extends PlatformCategory {
  pathSearch: string;
  sizeChartRule: SizeChartRule | null;
}

/** Bỏ dấu, đổi đ → d, chữ thường; như `normalizePath` ở BE */
export const foldPath = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();

function buildTree(rows: TreeRow[]): MockPlatformCategory[] {
  const out: MockPlatformCategory[] = [];
  rows.forEach(([externalId, parentIndex, name, isLeaf]) => {
    const parent = parentIndex >= 0 ? out[parentIndex] : null;
    const path = parent ? `${parent.path} > ${name}` : name;
    out.push({
      externalId,
      parentExternalId: parent?.externalId ?? null,
      name,
      path,
      pathSearch: foldPath(path),
      isLeaf: Boolean(isLeaf),
      status: 'active',
      sizeChartRule: null,
    });
  });
  return out;
}

const data = raw as unknown as { trees: Record<MockPlatform, TreeRow[]>; attrs: Record<MockPlatform, Record<string, AttrRow[]>> };

export const platformCategories: Record<MockPlatform, MockPlatformCategory[]> = {
  lazada: buildTree(data.trees.lazada),
  tiktok: buildTree(data.trees.tiktok),
};

/** TikTok quần áo, giày bắt buộc bảng kích cỡ (commerio-backend#347) */
for (const id of ['601226', '601357']) {
  const c = platformCategories.tiktok.find((x) => x.externalId === id);
  if (c) c.sizeChartRule = 'required';
}
const lipstick = platformCategories.tiktok.find((x) => x.externalId === '601534');
if (lipstick) lipstick.sizeChartRule = 'unsupported';

/**
 * Chỉ xuất xứ, thương hiệu là `tier = 'product'` (Documents/21 §18.5, chốt 18/11/2026); giấy phép riêng sàn (TikTok
 * `102872`, `103001`…, Lazada `VN_*licenseCode`) là `category`, lưu trong spec theo sàn. Bản thử 18/11 ghi `product`
 */
export const PRODUCT_TIER_CODES = new Set(['brand', 'country_origin_hb', '100149']);

/** Lazada không cho mã lựa chọn riêng: mã là chính nhãn; TikTok có mã số, bản thử không lưu nên tự đánh */
function toAttribute(platform: MockPlatform, row: AttrRow): Omit<PlatformAttribute, 'defaultValue'> {
  const [code, label, kind, rawTier, input, options, allowCustom, required, isKey] = row;
  const tier = rawTier === 'product' && !PRODUCT_TIER_CODES.has(code) ? 'category' : rawTier;
  return {
    code,
    label,
    kind,
    tier,
    input,
    options: options.map((o, i) => ({ id: platform === 'lazada' ? o : `${code}-${i + 1}`, label: o })),
    allowCustom: Boolean(allowCustom),
    required: Boolean(required),
    requiredWhen: null,
    isKey: Boolean(isKey),
  };
}

export interface MockLeafAttributes {
  attributes: Omit<PlatformAttribute, 'defaultValue'>[];
  fetchedAt: string;
}

const DAY = 86_400_000;
const FETCHED = '2026-11-18T03:00:00.000Z';

export const platformAttributes: Record<MockPlatform, Map<string, MockLeafAttributes>> = {
  lazada: new Map(),
  tiktok: new Map(),
};
for (const platform of MOCK_PLATFORMS) {
  for (const [leaf, rows] of Object.entries(data.attrs[platform])) {
    platformAttributes[platform].set(leaf, { attributes: rows.map((r) => toAttribute(platform, r)), fetchedAt: FETCHED });
  }
}
/** Lazada Son thỏi: bản lấy 10 ngày trước, sàn lỗi lúc lấy lại → BE trả bản cũ kèm `stale: true` */
const staleLeaf = platformAttributes.lazada.get('4640');
if (staleLeaf) staleLeaf.fetchedAt = new Date(Date.parse(FETCHED) - 10 * DAY).toISOString();
export const STALE_LEAVES: Record<MockPlatform, ReadonlySet<string>> = { lazada: new Set(['4640']), tiktok: new Set() };

/** Thuộc tính tổ chức chịu trách nhiệm hàng hoá lấy tên từ hồ sơ công ty (commerio-backend#292) */
export const COMPANY_NAME_ATTRIBUTES = new Set(['101489', 'Manufacturer_Or_Trader_Name']);
/** Địa chỉ tổ chức chịu trách nhiệm hàng hoá, cũng lấy từ hồ sơ công ty */
export const COMPANY_ADDRESS_ATTRIBUTES = new Set(['101490', 'Manufacturer_Address']);
/** Địa chỉ trong hồ sơ công ty (bản giả lập, commerio-backend#292) */
export const COMPANY_ADDRESSES: Record<string, string> = {
  'cmp-001': '268 Lý Thường Kiệt, Phường 14, Quận 10, TP.HCM',
};

/** channel.product_specs (Documents/19 §3.3): một bộ thông tin sàn mỗi (sản phẩm, sàn), mọi gian hàng dùng chung */
export interface MockProductSpec extends ProductSpec {
  companyId: string;
  platform: MockPlatform;
}

const SPEC_AT = '2026-11-18T04:00:00.000Z';

/**
 * Áo thun basic: Lazada đọc từ sàn lúc ghép SKU (shp-003) mà sàn không trả "Chất liệu" → còn thiếu, dòng hiện
 * "Bổ sung thông tin"; TikTok cũng ghép, đủ thông tin. Áo polo: Lazada đã lưu ở trang đẩy, đủ. Quần kaki: đủ cả hai sàn.
 * Thắt lưng (đã ghép SKU ở LazMall) chưa có thông tin sàn: dòng hiện "Bổ sung thông tin", đẩy báo `category_unmapped`.
 */
export const productSpecs: MockProductSpec[] = [
  {
    companyId: 'cmp-001',
    productId: 'prd-001',
    platform: 'lazada',
    externalCategoryId: '7930',
    categoryPath: '',
    categoryStatus: 'ok',
    attributes: { fa_pattern: 'Trơn', Fit_Type: 'Thường xuyên' },
    axisMap: { 'att-mau': '__custom', 'att-size': '__custom' },
    valueMap: {},
    source: 'match',
    version: 1,
    updatedAt: SPEC_AT,
  },
  {
    companyId: 'cmp-001',
    productId: 'prd-005',
    platform: 'lazada',
    externalCategoryId: '7930',
    categoryPath: '',
    categoryStatus: 'ok',
    attributes: { clothing_material: 'Vải piqué', fa_pattern: 'Trơn', Fit_Type: 'Thường xuyên' },
    axisMap: { 'att-mau': 'color_family', 'att-size': 'size' },
    valueMap: {},
    source: 'push',
    version: 2,
    updatedAt: SPEC_AT,
  },
  {
    companyId: 'cmp-001',
    productId: 'prd-001',
    platform: 'tiktok',
    externalCategoryId: '601226',
    categoryPath: '',
    categoryStatus: 'ok',
    attributes: {},
    axisMap: { 'att-mau': '__custom', 'att-size': '__custom' },
    valueMap: {},
    source: 'match',
    version: 1,
    updatedAt: SPEC_AT,
  },
  // Quần kaki: đã lưu cả hai sàn ở trang đẩy; leaf chưa có attribute trong bảng nên chỉ cần ánh xạ trục
  {
    companyId: 'cmp-001',
    productId: 'prd-002',
    platform: 'lazada',
    externalCategoryId: '7542',
    categoryPath: '',
    categoryStatus: 'ok',
    attributes: {},
    axisMap: { 'att-size': '__custom' },
    valueMap: {},
    source: 'push',
    version: 1,
    updatedAt: SPEC_AT,
  },
  {
    companyId: 'cmp-001',
    productId: 'prd-002',
    platform: 'tiktok',
    externalCategoryId: '601218',
    categoryPath: '',
    categoryStatus: 'ok',
    attributes: {},
    axisMap: { 'att-size': '__custom' },
    valueMap: {},
    source: 'push',
    version: 1,
    updatedAt: SPEC_AT,
  },
];
for (const s of productSpecs) {
  s.categoryPath = platformCategories[s.platform].find((c) => c.externalId === s.externalCategoryId)?.path ?? s.externalCategoryId;
}

/** channel.shop_category_permissions (TikTok): quyền bán category theo gian hàng, ghi từ gợi ý và lần kiểm khi đẩy */
export interface MockCategoryPermission {
  shopId: string;
  externalCategoryId: string;
  status: CategoryPermission;
}

/** ABC Outlet TikTok chưa được bán Giày thể thao nam (INVITE_ONLY) */
export const categoryPermissions: MockCategoryPermission[] = [
  { shopId: 'shp-008', externalCategoryId: '601357', status: 'invite_only' },
];

/** Từ khoá giả lập API gợi ý của sàn theo danh mục Commerio (bản thật gửi tên + ảnh sản phẩm lên sàn) */
export const SUGGESTION_KEYWORDS: Record<string, string> = {
  'cat-ao': 'ao phong',
  'cat-quan': 'quan dai',
  'cat-pk': 'that lung',
  'cat-somi': 'so mi',
};

export const categorySync: Record<MockPlatform, { syncedAt: string | null; pending: boolean }> = {
  lazada: { syncedAt: FETCHED, pending: false },
  tiktok: { syncedAt: FETCHED, pending: false },
};
