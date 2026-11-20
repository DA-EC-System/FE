import type { ListingRow, PlatformAttribute, PlatformAttributeInput, SizeChartRule } from '@/types/shop';

/** Sàn có tab ở trang Nhóm hàng & thuộc tính (commerio-backend#400) */
export const PLATFORM_TABS = [
  { platform: 'lazada', label: 'Lazada' },
  { platform: 'tiktok', label: 'TikTok Shop' },
] as const;

export type PlatformTab = (typeof PLATFORM_TABS)[number]['platform'];

export const isPlatformTab = (value: string | null): value is PlatformTab =>
  PLATFORM_TABS.some((t) => t.platform === value);

export const platformLabel = (platform: string) =>
  PLATFORM_TABS.find((t) => t.platform === platform)?.label ?? platform;

/** Có điều kiện bắt buộc theo attribute khác (Documents/21 §18.5: `{ code, optionIds }[] | null`) */
export function hasCondition(a: Pick<PlatformAttribute, 'requiredWhen'>): boolean {
  return Boolean(a.requiredWhen?.length);
}

export type AttributeGroupKey = 'sales' | 'required' | 'conditional' | 'key' | 'product' | 'company' | 'optional';

export const ATTRIBUTE_GROUPS: { key: AttributeGroupKey; title: string; hint?: string }[] = [
  { key: 'sales', title: 'Thuộc tính phân loại (sales attribute)', hint: 'Khớp với thuộc tính phân loại của sản phẩm ở bước Variant khi đăng bán' },
  { key: 'required', title: 'Bắt buộc' },
  { key: 'conditional', title: 'Bắt buộc theo điều kiện', hint: 'Bắt buộc khi attribute khác có giá trị nhất định' },
  { key: 'key', title: 'Attribute quan trọng', hint: 'Không bắt buộc nhưng sàn dùng để lọc, xếp hạng' },
  { key: 'product', title: 'Thông tin sản phẩm', hint: 'Lấy từ trang sản phẩm Commerio, dùng chung mọi sàn' },
  { key: 'company', title: 'Thông tin công ty', hint: 'Lấy từ hồ sơ công ty, không cần nhập lại' },
  { key: 'optional', title: 'Không bắt buộc' },
];

/** Mỗi attribute vào đúng một nhóm: trục phân loại, rồi theo tier, rồi theo mức bắt buộc */
export function attributeGroup(a: PlatformAttribute): AttributeGroupKey {
  if (a.kind === 'sales') return 'sales';
  if (a.tier === 'product') return 'product';
  if (a.tier === 'company') return 'company';
  if (a.required) return 'required';
  if (hasCondition(a)) return 'conditional';
  if (a.isKey) return 'key';
  return 'optional';
}

export function groupAttributes(attributes: PlatformAttribute[]) {
  return ATTRIBUTE_GROUPS.map((g) => ({ ...g, items: attributes.filter((a) => attributeGroup(a) === g.key) })).filter(
    (g) => g.items.length > 0,
  );
}

const INPUT_LABELS: Record<PlatformAttributeInput, string> = {
  select: 'Chọn một',
  multiselect: 'Chọn nhiều',
  text: 'Nhập chữ',
  number: 'Nhập số',
  date: 'Ngày',
  image: 'Ảnh',
  cascade: 'Chọn theo cấp',
};

/** "Chọn một · 107 lựa chọn · cho nhập giá trị riêng" */
export function inputSummary(a: Pick<PlatformAttribute, 'input' | 'options' | 'allowCustom'>): string {
  const parts = [INPUT_LABELS[a.input] ?? a.input];
  if (a.options.length) parts.push(`${a.options.length} lựa chọn`);
  if (a.options.length && a.allowCustom) parts.push('cho nhập giá trị riêng');
  return parts.join(' · ');
}

export const SIZE_CHART_LABELS: Record<SizeChartRule, string> = {
  required: 'Bắt buộc bảng kích cỡ',
  optional: 'Bảng kích cỡ không bắt buộc',
  unsupported: 'Không dùng bảng kích cỡ',
};

/** Cha của category: đường dẫn bỏ phần cuối */
export const parentPath = (path: string) => path.split(' > ').slice(0, -1).join(' > ');

/** Các cấp của đường dẫn "A > B > C" */
export const pathSegments = (path: string) => path.split(' > ').filter(Boolean);

/**
 * Cột cần mở để thấy category có `pathIds` (gốc → chính nó): cột gốc (`null`) rồi mỗi tổ tiên; category cấp cuối không
 * mở thêm cột. Bộ chọn dạng cột mở sẵn nhánh đang chọn (commerio-backend#467)
 */
export const columnParents = (pathIds: readonly string[]): (string | null)[] => [null, ...pathIds.slice(0, -1)];


/** Một sản phẩm trên sàn của một gian hàng, gom các dòng listing (SKU) của nó */
export interface RemoteProductDrift {
  shopId: string;
  externalProductId: string;
  rows: ListingRow[];
  /** Một trong các dòng đang `live` hay `hidden` (để hiện "đang bán" hay "đang ẩn") */
  status: 'live' | 'hidden';
  /** Có dòng do người bán tự đăng trên sàn: chỉ CEO đổi category được */
  platformOwned: boolean;
  fromPath: string;
}

/**
 * Sản phẩm trên sàn có category khác spec đã lưu. Điều kiện như BE chọn cho `apply-category` (§18.5): listing `live` hoặc
 * `hidden`, có mã sàn. FE chỉ có đường dẫn category của listing, không có id, nên so đường dẫn; listing chưa rõ đường dẫn
 * (`null`, cây chưa đồng bộ) thì bỏ qua, BE vẫn quyết theo id khi gọi
 */
export function categoryDrift(rows: { shopId: string; row: ListingRow }[], specPath: string): RemoteProductDrift[] {
  const groups = new Map<string, RemoteProductDrift>();
  for (const { shopId, row } of rows) {
    const l = row.listing;
    if (!l?.externalProductId || (l.status !== 'live' && l.status !== 'hidden')) continue;
    if (!row.externalCategoryPath || row.externalCategoryPath === specPath) continue;
    const key = `${shopId}/${l.externalProductId}`;
    const g = groups.get(key) ?? {
      shopId,
      externalProductId: l.externalProductId,
      rows: [],
      status: l.status,
      platformOwned: false,
      fromPath: row.externalCategoryPath,
    };
    g.rows.push(row);
    if (l.status === 'live') g.status = 'live';
    if (l.contentSource === 'platform') g.platformOwned = true;
    groups.set(key, g);
  }
  return [...groups.values()];
}

/** Đang theo dõi `categoryChange.queued` như `pushing`: hỏi lại mỗi 5 giây, tối đa 30 phút (§18.5) */
export const CATEGORY_POLL_MS = 5000;
export const CATEGORY_POLL_MAX_MS = 30 * 60 * 1000;

export function categoryPollDelay(rows: ListingRow[], startedAt: number, now: number): number | false {
  if (!rows.some((r) => r.categoryChange?.status === 'queued')) return false;
  return now - startedAt < CATEGORY_POLL_MAX_MS ? CATEGORY_POLL_MS : false;
}

export const CEO_ONLY_CATEGORY = 'Chỉ CEO đổi được category của sản phẩm người bán tự đăng trên sàn';

/** Câu cho mã lỗi của `apply-category`; mã lạ trả null để dùng câu chung */
export function applyCategoryError(code: string | undefined, label: string): string | null {
  switch (code) {
    case 'category_unmapped':
      return 'Chưa lưu thông tin sàn của sản phẩm. Lưu rồi thử lại.';
    case 'spec_incomplete':
      return 'Thông tin sàn còn thiếu hoặc category đã đổi. Điền đủ các bước rồi lưu lại.';
    case 'version_conflict':
      return `Người khác vừa sửa thông tin ${label} của sản phẩm. Đã nạp bản mới nhất, kiểm tra rồi bấm lại.`;
    case 'category_in_sync':
      return `Sản phẩm trên ${label} đã ở đúng category này.`;
    case 'size_chart_missing':
      return 'Category mới bắt buộc bảng size. Thêm bảng size ở trang sản phẩm rồi thử lại.';
    case 'category_change_in_progress':
      return 'Sản phẩm đang đổi category, chờ lượt này xong rồi thử lại.';
    case 'shared_remote_product':
      return `Sản phẩm trên ${label} có SKU của sản phẩm khác, Commerio chưa đổi category được. Sửa trên Seller Center.`;
    case 'forbidden':
      return CEO_ONLY_CATEGORY;
    case 'marketplace_unsupported':
      return `Commerio chưa đổi category trên ${label} được.`;
    default:
      return null;
  }
}
