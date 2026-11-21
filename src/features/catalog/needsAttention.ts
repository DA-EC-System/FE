import type { ProductVariant, VariantMissing } from '@/types/catalog';
import type { ProductListingRow } from '@/types/shop';
import type { MissingItem } from './completion';

/**
 * Hộp "Cần xử lý" đầu trang sản phẩm (bản phác `.claude/issues/trang-san-pham-tab/design/v2.html`, chốt v2 câu 7;
 * CLAUDE.md "Lỗi phải chỉ chỗ sửa"): gom lỗi chặn của cả trang, mỗi mục một nút tới đúng chỗ sửa. Vẫn báo tại chỗ.
 * Phần "tab sàn còn thiếu" do component đếm theo từng sàn (cần gọi API), không ở đây.
 */
export type AttentionAction =
  /** Cuộn, focus ô trên tab Nội bộ */
  | { kind: 'focus'; target: string }
  /** Mở hộp Thông tin SKU của biến thể */
  | { kind: 'sku'; variantId: string }
  /** Trang Cấu hình phí sàn và thuế */
  | { kind: 'fee' }
  /** Mở tab của sàn */
  | { kind: 'tab'; platform: string };

export interface AttentionItem {
  key: string;
  text: string;
  actionLabel: string;
  action: AttentionAction;
}

/** Phần còn thiếu nằm ở hộp Thông tin SKU: mở thẳng hộp của biến thể đầu tiên còn thiếu */
const SKU_FIELDS: Partial<Record<VariantMissing, string>> = {
  price: 'giá muốn thực nhận',
  weight: 'cân nặng',
  dimensions: 'kích thước gói',
};

const REJECTED = new Set(['push_failed', 'rejected']);

export function attentionItems(input: {
  missing: readonly MissingItem[];
  variants: readonly Pick<ProductVariant, 'id' | 'sku' | 'attributes' | 'missing' | 'businessStatus'>[];
  rows: readonly ProductListingRow[];
  /** Tên hiển thị của sàn */
  platformName: (platform: string) => string;
}): AttentionItem[] {
  const out: AttentionItem[] = [];
  const live = input.variants.filter((v) => v.businessStatus !== 'archived');
  for (const m of input.missing) {
    const field = SKU_FIELDS[m.key as VariantMissing];
    const first = field ? live.find((v) => v.missing.includes(m.key as VariantMissing)) : undefined;
    if (field && first) {
      const name = first.attributes.map((a) => a.value).join(' / ') || first.sku;
      const more = (m.skuCount ?? 1) > 1 ? ` (và ${(m.skuCount ?? 1) - 1} biến thể khác)` : '';
      out.push({
        key: `sku:${m.key}`,
        text: `Biến thể ${name} chưa có ${field}${more}`,
        actionLabel: `Mở Thông tin SKU ${first.sku}`,
        action: { kind: 'sku', variantId: first.id },
      });
    } else {
      out.push({
        key: `focus:${m.key}`,
        text: `Còn thiếu ${m.label.toLowerCase()}${m.skuCount ? ` · ${m.skuCount} biến thể` : ''}`,
        actionLabel: 'Tới ô cần điền',
        action: { kind: 'focus', target: m.target },
      });
    }
  }
  // Gian hàng chưa có cấu hình phí: có giá mà chưa tính được thực nhận, dòng chưa lên sàn (21 §18.6.7, §18.9)
  const noFee = [...new Set(input.rows.filter((r) => !r.listing && r.price !== null && r.netReceived === null).map((r) => r.shopName))];
  if (noFee.length) {
    out.push({
      key: 'fee',
      text: `${noFee.join(', ')} chưa có cấu hình phí sàn: chưa tính được phí, thực nhận nên chưa đăng được`,
      actionLabel: 'Mở Cấu hình phí sàn và thuế',
      action: { kind: 'fee' },
    });
  }
  // Sàn từ chối hoặc đẩy lỗi: một mục mỗi sàn, nêu lỗi đầu tiên
  const byPlatform = new Map<string, ProductListingRow[]>();
  for (const r of input.rows) {
    if (r.listing && REJECTED.has(r.listing.status)) byPlatform.set(r.platform, [...(byPlatform.get(r.platform) ?? []), r]);
  }
  for (const [platform, rs] of byPlatform) {
    const r = rs[0]!;
    const reason = r.listing?.rejectReason ?? r.listing?.pushError?.message ?? 'Sàn báo lỗi';
    const name = input.platformName(platform);
    out.push({
      key: `rejected:${platform}`,
      text: `${name}: ${r.shopName} chưa nhận ${r.attributesLabel || r.sku}: "${reason}"${rs.length > 1 ? ` (và ${rs.length - 1} SKU khác)` : ''}`,
      actionLabel: `Xem ở tab ${name}`,
      action: { kind: 'tab', platform },
    });
  }
  return out;
}
