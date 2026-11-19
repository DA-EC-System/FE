import type { PlatformAttribute, PlatformAttributeInput, SizeChartRule } from '@/types/shop';

/** Sàn có tab ở trang Danh mục & thuộc tính (commerio-backend#400) */
export const PLATFORM_TABS = [
  { platform: 'lazada', label: 'Lazada' },
  { platform: 'tiktok', label: 'TikTok' },
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
  { key: 'sales', title: 'Sales attribute (trục phân loại)', hint: 'Ánh xạ với thuộc tính phân loại của sản phẩm ở bước Variants khi đẩy' },
  { key: 'required', title: 'Bắt buộc' },
  { key: 'conditional', title: 'Bắt buộc theo điều kiện', hint: 'Bắt buộc khi attribute khác có giá trị nhất định' },
  { key: 'key', title: 'Key attribute', hint: 'Không bắt buộc nhưng sàn dùng để lọc, xếp hạng' },
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
