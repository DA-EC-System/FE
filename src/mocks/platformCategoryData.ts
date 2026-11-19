/**
 * channel.platform_categories, channel.platform_category_attributes (commerio-backend#400, Documents/19 §3.3).
 * Cây và attribute lấy từ lần gọi thật Lazada, TikTok ngày 18/11/2026 (prototype `.claude/issues/backend-400/data.js`).
 * Attribute chỉ có của 3 leaf mỗi sàn; leaf khác coi như chưa lấy từ sàn.
 */

import type { PlatformAttribute, PlatformCategory, SizeChartRule } from '@/types/shop';
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

/** Lazada không cho mã lựa chọn riêng: mã là chính nhãn; TikTok có mã số, bản thử không lưu nên tự đánh */
function toAttribute(platform: MockPlatform, row: AttrRow): Omit<PlatformAttribute, 'defaultValue'> {
  const [code, label, kind, tier, input, options, allowCustom, required, isKey] = row;
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

/** channel.product_specs tối giản: sản phẩm của công ty đang dùng leaf nào */
export interface MockProductSpec {
  companyId: string;
  productId: string;
  platform: MockPlatform;
  externalCategoryId: string;
  source: 'push' | 'match';
}

export const productSpecs: MockProductSpec[] = [
  { companyId: 'cmp-001', productId: 'prd-001', platform: 'lazada', externalCategoryId: '7930', source: 'push' },
  { companyId: 'cmp-001', productId: 'prd-005', platform: 'lazada', externalCategoryId: '7930', source: 'push' },
  { companyId: 'cmp-001', productId: 'prd-001', platform: 'tiktok', externalCategoryId: '601226', source: 'match' },
];

export const categorySync: Record<MockPlatform, { syncedAt: string | null; pending: boolean }> = {
  lazada: { syncedAt: FETCHED, pending: false },
  tiktok: { syncedAt: FETCHED, pending: false },
};
