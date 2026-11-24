import type { RemoteSku } from '@/types/shop';

/** Một sản phẩm trên sàn và các SKU của nó trong danh sách đang xem (FE#460) */
export interface RemoteGroup {
  /** `externalProductId`; SKU sàn thiếu mã sản phẩm thì đứng riêng theo `externalSkuId` */
  key: string;
  title: string;
  skus: RemoteSku[];
}

/**
 * Dòng của bảng SKU sàn. Sản phẩm có từ 2 SKU thì có một dòng cha (`group`) đứng trước, các SKU con (`child`) hiện khi mở;
 * sản phẩm một SKU giữ một dòng như cũ. Dòng cha mượn trường của SKU đầu để dùng chung cột, `externalSkuId` đổi thành
 * `product:<key>` cho id dòng không trùng
 */
export type RemoteTableRow = RemoteSku & {
  group?: { key: string; count: number; open: boolean };
  child?: boolean;
};

/** Gom SKU sàn theo sản phẩm, giữ thứ tự xuất hiện đầu tiên của từng sản phẩm */
export function groupRemote(items: readonly RemoteSku[]): RemoteGroup[] {
  const byKey = new Map<string, RemoteGroup>();
  for (const sku of items) {
    const key = sku.externalProductId || `sku:${sku.externalSkuId}`;
    const g = byKey.get(key);
    if (g) g.skus.push(sku);
    else byKey.set(key, { key, title: sku.title, skus: [sku] });
  }
  return [...byKey.values()];
}

/** Dòng bảng của các sản phẩm trên một trang; `closed` là các sản phẩm đang gập */
export function remoteTableRows(groups: readonly RemoteGroup[], closed: ReadonlySet<string>): RemoteTableRow[] {
  const out: RemoteTableRow[] = [];
  for (const g of groups) {
    if (g.skus.length === 1) {
      out.push(g.skus[0]);
      continue;
    }
    const open = !closed.has(g.key);
    out.push({ ...g.skus[0], externalSkuId: `product:${g.key}`, title: g.title, group: { key: g.key, count: g.skus.length, open } });
    if (open) out.push(...g.skus.map((s) => ({ ...s, child: true })));
  }
  return out;
}
