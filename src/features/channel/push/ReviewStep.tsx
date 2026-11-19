import { AlertMessage } from '@/components/common/AlertMessage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/utils/format';
import type { ProductDetail } from '@/types/catalog';
import type { PlatformAttribute, Shop, SpecMissing } from '@/types/shop';
import { STATUS_LABELS, isUsable } from '../shopSchemas';
import { stepOfMissing, type PushStep, type SpecDraft } from '../specDraft';

interface ReviewStepProps {
  label: string;
  product: ProductDetail;
  draft: SpecDraft;
  sales: PlatformAttribute[] | null;
  missing: SpecMissing[];
  /** Spec đọc từ sàn lúc ghép SKU: chỉ lưu, không đẩy */
  fillOnly: boolean;
  shops: Shop[];
  selected: ReadonlySet<string>;
  /** Gian hàng biết chắc không bán được category này (quyền TikTok), kèm lý do */
  blockedShops: ReadonlyMap<string, string>;
  onToggleShop: (shopId: string, on: boolean) => void;
  onGoto: (step: PushStep) => void;
}

const STEP_NAMES = ['Category', 'Attributes', 'Variants'];

/** Bước 4: còn thiếu gì, đẩy lên gian hàng nào, ảnh và SKU sẽ gửi */
export function ReviewStep({ label, product, draft, sales, missing, fillOnly, shops, selected, blockedShops, onToggleShop, onGoto }: ReviewStepProps) {
  const variants = product.variants.filter((v) => !v.archivedAt);
  const images = [...product.images].sort((a, b) => a.position - b.position);
  const sent = (attributeId: string, valueId: string, value: string) => {
    const attr = sales?.find((s) => s.code === draft.axisMap[attributeId]);
    const option = attr?.options.find((o) => o.id === draft.valueMap[valueId]);
    return option ? option.label : value;
  };
  return (
    <div className="grid gap-5">
      {missing.length ? (
        <AlertMessage severity="error">
          <b>{fillOnly ? 'Còn thiếu:' : 'Chưa đẩy được, còn thiếu:'}</b>
          <ul className="mt-1 grid gap-1">
            {missing.map((m) => (
              <li key={`${m.reason}-${m.code}`} className="flex flex-wrap items-center gap-2">
                {m.label}
                <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => onGoto(stepOfMissing(m.reason))}>
                  Sửa ở bước {STEP_NAMES[stepOfMissing(m.reason)]}
                </Button>
              </li>
            ))}
          </ul>
        </AlertMessage>
      ) : (
        <AlertMessage severity="success">
          <b>Sẵn sàng.</b>{' '}
          {fillOnly
            ? `Lưu thông tin ${label} cho sản phẩm; nội dung trên sàn cập nhật ở trang Sản phẩm trên sàn.`
            : `${variants.length} SKU sẽ được đẩy lên ${label}, category “${draft.categoryPath.split(' > ').at(-1)}”.`}
        </AlertMessage>
      )}

      {!fillOnly && (
        <section className="grid gap-2">
          <h3 className="text-sm font-semibold">
            Đẩy lên gian hàng <span className="font-normal text-muted-foreground">· thông tin ở ba bước trước dùng chung cho mọi gian hàng {label}</span>
          </h3>
          {shops.length ? (
            shops.map((s) => {
              const usable = isUsable(s.status);
              const blocked = blockedShops.get(s.id);
              const disabled = !usable || Boolean(blocked);
              return (
                <label key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <Checkbox checked={selected.has(s.id)} disabled={disabled} onCheckedChange={(on) => onToggleShop(s.id, on === true)} />
                  <span className={disabled ? 'text-muted-foreground' : undefined}>{s.shopName}</span>
                  {!usable && <Badge variant="outline">{STATUS_LABELS[s.status]}</Badge>}
                  {blocked && <Badge variant="destructive">{blocked}</Badge>}
                </label>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">Công ty chưa có gian hàng {label} nào.</p>
          )}
        </section>
      )}

      <section className="grid gap-2">
        <h3 className="text-sm font-semibold">
          Ảnh chung của sản phẩm <span className="font-normal text-muted-foreground">· lấy từ trang sản phẩm · {images.length} ảnh</span>
        </h3>
        {images.length ? (
          <div className="flex flex-wrap gap-2">
            {images.map((img) => (
              <img key={img.id} src={img.url} alt={`Ảnh ${img.position + 1}`} className="size-20 rounded-md border object-cover" />
            ))}
          </div>
        ) : (
          <p className="text-sm text-warning-text">Sản phẩm chưa có ảnh; sàn từ chối sản phẩm không ảnh.</p>
        )}
      </section>

      <section className="grid gap-2">
        <h3 className="text-sm font-semibold">SKU sẽ gửi</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Seller SKU</TableHead>
              <TableHead>Phân loại gửi lên</TableHead>
              <TableHead className="text-right">Giá chuẩn</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="font-mono text-xs">{v.sku}</TableCell>
                <TableCell>{v.attributes.map((a) => `${a.attributeName}: ${sent(a.attributeId, a.valueId, a.value)}`).join(' · ') || '—'}</TableCell>
                <TableCell className="text-right">{v.standardPrice === null ? '—' : formatCurrency(v.standardPrice)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">
          Giá lên sàn lấy từ bảng giá của gian hàng, thiếu thì lấy giá chuẩn. Sửa giá, tồn ở trang Sản phẩm trên sàn.
        </p>
      </section>
    </div>
  );
}
