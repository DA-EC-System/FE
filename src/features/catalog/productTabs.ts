import type { ProductDetail, ProductVariant, VariantUpdateInput } from '@/types/catalog';
import type {
  Marketplace,
  PlatformAttribute,
  ProductListingRow,
  ProductSpec,
  RemoteProductFacts,
  RemoteVariantFacts,
  ResolvedAttribute,
  SizeChartRule,
  SpecValue,
} from '@/types/shop';
import { conditionMet, effectiveValue, isFilled } from '@/features/channel/specDraft';

/**
 * Trang sản phẩm theo tab nơi bán (FE#417, commerio-backend#497): hàm thuần chọn tab, chia attribute theo khối, đếm
 * trường dùng chung còn thiếu cho từng sàn. Không gọi API.
 */

export type ProductTabKey = 'commerio' | Marketplace;

/** id các ô ở tab Commerio để tab sàn nhảy tới ("Dùng chung · sửa ở Commerio") */
export const SHARED_TARGETS = {
  name: 'product-field-name',
  description: 'product-field-description',
  images: 'product-field-images',
  origin: 'product-field-origin',
  brand: 'product-field-brand',
  sizeChart: 'product-field-size-chart',
  variants: 'product-field-variants',
  /** Card "Thông số của nhóm" ở tab Commerio (thông số gốc ánh xạ sang attribute sàn) */
  specs: 'product-field-specs',
} as const;
export type SharedTarget = keyof typeof SHARED_TARGETS | `spec:${string}`;

/**
 * id phần tử cần focus khi nhảy sang tab Commerio. `spec:<fieldId>` là đúng ô thông số của nhóm
 * (`product-field-spec-<fieldId>`), không có ô đó thì về card "Thông số của nhóm"
 */
export function sharedTargetId(t: SharedTarget, exists: (id: string) => boolean): string {
  if (!t.startsWith('spec:')) return SHARED_TARGETS[t as keyof typeof SHARED_TARGETS];
  const id = `product-field-spec-${t.slice('spec:'.length)}`;
  return exists(id) ? id : SHARED_TARGETS.specs;
}

/** id ô attribute ở tab sàn; khác id của trang đẩy để hai trang không đụng nhau */
export const platformFieldId = (platform: string, code: string) => `ptab-${platform}-${code.replace(/\W/g, '_')}`;
export const platformSectionId = (platform: string, section: string) => `ptab-${platform}-section-${section}`;

/**
 * Sàn có tab: sàn công ty có gian hàng và sản phẩm đã có spec (đẩy hoặc ghép) hoặc có listing ở sàn đó. Giữ thứ tự
 * `platforms`
 */
export function visiblePlatforms(
  platforms: readonly Marketplace[],
  hasSpec: (p: Marketplace) => boolean,
  rows: readonly Pick<ProductListingRow, 'platform' | 'listing'>[],
): Marketplace[] {
  return platforms.filter((p) => hasSpec(p) || rows.some((r) => r.platform === p && r.listing));
}

/** `?tab=` hợp lệ thì mở tab đó, không thì tab Commerio */
export function tabFromParam(param: string | null, visible: readonly Marketplace[]): ProductTabKey {
  return param && (visible as readonly string[]).includes(param) ? (param as Marketplace) : 'commerio';
}

export interface AttributeGroups {
  /** Bắt buộc, kể cả bắt buộc theo điều kiện đang đúng: sửa tại chỗ */
  required: PlatformAttribute[];
  /** Key attribute không bắt buộc: sửa tại chỗ, gập mặc định (chốt v2 câu 4) */
  key: PlatformAttribute[];
  /** Không bắt buộc, không key, kể cả còn trống: sửa tại chỗ, gập mặc định (chốt v2 câu 4) */
  other: PlatformAttribute[];
}

/** Chia attribute (bỏ sales attribute, đi qua ánh xạ trục) theo khối của tab sàn */
export function attributeGroups(attrs: readonly PlatformAttribute[], values: Record<string, SpecValue>): AttributeGroups {
  const out: AttributeGroups = { required: [], key: [], other: [] };
  for (const a of attrs) {
    if (a.kind === 'sales') continue;
    if (a.required || conditionMet(a, values)) out.required.push(a);
    else if (a.isKey) out.key.push(a);
    // Xuất xứ, thương hiệu (tier product) dùng chung, sửa ở tab Nội bộ; chỉ hiện ở nhóm khác khi đã có giá trị
    else if (a.tier !== 'product' || isFilled(effectiveValue(a, values))) out.other.push(a);
  }
  return out;
}

/** Nguồn của một ô ở tab sàn */
export type FieldSource = 'shared' | 'own' | 'company' | 'match' | 'override' | 'catalog' | 'default';

/**
 * Nguồn của một attribute ở tab sàn. Có `source` (nguồn đã tính từ `resolved`, Documents/21 §18.8.2) thì theo nó; ghi đè
 * thì tách tiếp theo `fieldSources` (commerio-backend#497): đọc lúc ghép là "Đọc từ sàn khi ghép", lưu lúc đẩy là "Riêng
 * cho sàn", người dùng sửa là "Bạn sửa riêng". Chưa có giá trị thì theo tier
 */
export const attributeSource = (
  a: Pick<PlatformAttribute, 'tier' | 'code'>,
  fieldSources?: ProductSpec['fieldSources'],
  source?: ResolvedAttribute['source'] | null,
): FieldSource => {
  if (source === 'catalog' || source === 'company' || source === 'default') return source;
  if (source === 'override') {
    const from = fieldSources?.[a.code];
    return from === 'match' ? 'match' : from === 'push' ? 'own' : 'override';
  }
  return a.tier === 'product' ? 'shared' : a.tier === 'company' ? 'company' : fieldSources?.[a.code] === 'match' ? 'match' : 'own';
};

export interface SharedGap {
  target: SharedTarget;
  label: string;
}

const activeVariants = (variants: readonly ProductVariant[]) => variants.filter((v) => v.businessStatus !== 'archived');

/** Biến thể chưa lưu trữ còn thiếu cân nặng hoặc kích thước đóng gói (hai sàn đều bắt buộc khi đẩy) */
export const variantsMissingShipping = (variants: readonly ProductVariant[]) =>
  activeVariants(variants).filter((v) => v.weightG === null || v.lengthMm === null || v.widthMm === null || v.heightMm === null);

/**
 * Trường dùng chung (điền ở tab Commerio) mà sàn cần nhưng sản phẩm còn trống: ảnh, mô tả, ảnh bảng size khi category
 * bắt buộc, cân nặng và kích thước của biến thể. Xuất xứ không ở đây vì đã tính trong `missing` của spec
 */
export function sharedGaps(
  product: Pick<ProductDetail, 'images' | 'description' | 'sizeChart' | 'variants'>,
  sizeChartRule: SizeChartRule | null,
): SharedGap[] {
  const out: SharedGap[] = [];
  if (!product.images.length) out.push({ target: 'images', label: 'Ảnh sản phẩm' });
  if (!product.description.trim()) out.push({ target: 'description', label: 'Mô tả' });
  if (sizeChartRule === 'required' && !product.sizeChart) out.push({ target: 'sizeChart', label: 'Ảnh bảng size' });
  if (variantsMissingShipping(product.variants).length) out.push({ target: 'variants', label: 'Cân nặng, kích thước kiện' });
  return out;
}

export interface ShopListings {
  shopId: string;
  shopName: string;
  rows: ProductListingRow[];
}

/** Dòng listing của một sàn gom theo gian hàng, giữ thứ tự BE trả; gồm cả dòng chưa lên sàn của gian hàng đó */
export function listingsByShop(rows: readonly ProductListingRow[], platform: Marketplace): ShopListings[] {
  const out = new Map<string, ShopListings>();
  for (const r of rows) {
    if (r.platform !== platform) continue;
    const shop = out.get(r.shopId) ?? { shopId: r.shopId, shopName: r.shopName, rows: [] };
    shop.rows.push(r);
    out.set(r.shopId, shop);
  }
  return [...out.values()];
}

export type ProductFactField = 'originCountry' | 'brand' | 'description';

/**
 * Trường sản phẩm mà sàn đang ghi khác giá trị đã lưu (dòng "Sàn đang ghi … [Dùng giá trị này]"). Bỏ khi sàn không có giá
 * trị: `brand` null là sàn ghi "No Brand", không gợi ý xoá thương hiệu đang có
 */
export function productSuggestions(
  product: Pick<ProductDetail, 'originCountry' | 'brand' | 'description'>,
  remote: Pick<RemoteProductFacts, 'originCountry' | 'brand' | 'description'>,
): Partial<Record<ProductFactField, string>> {
  const out: Partial<Record<ProductFactField, string>> = {};
  const origin = remote.originCountry?.trim().toUpperCase();
  if (origin && origin !== (product.originCountry ?? '').toUpperCase()) out.originCountry = origin;
  const brand = remote.brand?.trim();
  if (brand && brand !== (product.brand ?? '').trim()) out.brand = brand;
  const description = remote.description?.trim();
  if (description && description !== product.description.trim()) out.description = description;
  return out;
}

const SHIPPING = ['weightG', 'lengthMm', 'widthMm', 'heightMm'] as const;

/** Cân nặng, kích thước sàn đang ghi khác SKU: patch các ô sàn có số và khác; null khi không có gì để đổi */
export function variantSuggestion(
  variant: Pick<ProductVariant, (typeof SHIPPING)[number]>,
  remote: RemoteVariantFacts | undefined,
): Omit<VariantUpdateInput, 'version'> | null {
  if (!remote) return null;
  const patch: Omit<VariantUpdateInput, 'version'> = {};
  for (const f of SHIPPING) {
    const v = remote[f];
    if (v !== null && v !== variant[f]) patch[f] = v;
  }
  return Object.keys(patch).length ? patch : null;
}
