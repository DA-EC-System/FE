import { AlertMessage } from '@/components/common/AlertMessage';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { PlatformAttribute } from '@/types/shop';
import { CUSTOM_AXIS, type ProductAxis, type SpecDraft } from '../specDraft';
import { axisFieldId, valueFieldId } from './fieldIds';

const NONE = '__none__';

interface VariantsStepProps {
  platform: string;
  label: string;
  axes: ProductAxis[];
  /** Sales attribute của leaf; null khi chưa tải được attribute */
  sales: PlatformAttribute[] | null;
  draft: SpecDraft;
  errors: Record<string, string>;
  onAxis: (axis: ProductAxis, code: string) => void;
  onValue: (valueId: string, optionId: string | null) => void;
}

/** Bước 3: mỗi trục phân loại ↔ sales attribute của sàn (hoặc tên tự đặt); mỗi giá trị ↔ giá trị chuẩn hoặc để trống */
export function VariantsStep({ platform, label, axes, sales, draft, errors, onAxis, onValue }: VariantsStepProps) {
  if (!axes.length) {
    return <AlertMessage severity="info">Sản phẩm không có variant: đẩy lên một SKU, không gửi sales attribute.</AlertMessage>;
  }
  const list = sales ?? [];
  return (
    <div className="grid gap-4">
      <AlertMessage severity="info">
        {platform === 'tiktok'
          ? 'TikTok: sales attribute có sẵn (Màu sắc, Kích cỡ); giá trị gửi nguyên giá trị của Commerio. Tối đa 3 sales attribute, 100 SKU.'
          : 'Lazada: sales attribute chuẩn có danh sách giá trị chuẩn riêng theo category. Ánh xạ để sản phẩm hiện đúng trong bộ lọc của sàn; để trống thì gửi giá trị riêng. Tối đa 2 sales attribute.'}
      </AlertMessage>
      {axes.map((axis) => {
        const code = draft.axisMap[axis.attributeId] ?? '';
        const attr = list.find((s) => s.code === code);
        const axisError = errors[`axisMap.${axis.attributeId}`];
        return (
          <section key={axis.attributeId} className="rounded-lg border">
            <h3 className="border-b bg-table-head px-4 py-2 text-sm font-semibold">
              Thuộc tính phân loại “{axis.name}” <span className="font-normal text-muted-foreground">· {axis.values.length} giá trị</span>
            </h3>
            <div className="grid gap-3 p-4">
              <div className="grid max-w-md gap-1.5">
                <Label htmlFor={axisFieldId(axis.attributeId)}>Ánh xạ sang sales attribute của {label}</Label>
                <Select value={code || undefined} onValueChange={(v) => onAxis(axis, v)}>
                  <SelectTrigger id={axisFieldId(axis.attributeId)} className="w-full" aria-invalid={Boolean(axisError) || undefined}>
                    <SelectValue placeholder="Chọn…" />
                  </SelectTrigger>
                  <SelectContent>
                    {list.map((s) => (
                      <SelectItem key={s.code} value={s.code}>
                        {s.label} ({s.code})
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_AXIS}>Tên tự đặt “{axis.name}”</SelectItem>
                  </SelectContent>
                </Select>
                {axisError && <p className="text-xs text-destructive-text">{axisError}</p>}
              </div>
              {attr?.options.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Giá trị Commerio</TableHead>
                      <TableHead>
                        Giá trị chuẩn của {label} ({attr.options.length} lựa chọn)
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {axis.values.map((v) => {
                      const picked = draft.valueMap[v.id];
                      const err = errors[`valueMap.${v.id}`];
                      return (
                        <TableRow key={v.id}>
                          <TableCell>{v.value}</TableCell>
                          <TableCell className="grid gap-1">
                            <Select value={picked ?? NONE} onValueChange={(o) => onValue(v.id, o === NONE ? null : o)}>
                              <SelectTrigger
                                id={valueFieldId(v.id)}
                                className="w-full max-w-sm"
                                aria-label={`Giá trị chuẩn cho ${v.value}`}
                                aria-invalid={Boolean(err) || undefined}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE}>Giá trị riêng “{v.value}”</SelectItem>
                                {attr.options.map((o) => (
                                  <SelectItem key={o.id} value={o.id}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {err ? (
                              <span className="text-xs text-destructive-text">{err}</span>
                            ) : (
                              !picked && (
                                <span className="text-xs text-warning-text">
                                  Gửi giá trị riêng: sản phẩm không hiện trong bộ lọc {axis.name.toLowerCase()} của sàn
                                </span>
                              )
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">Giá trị gửi lên: {axis.values.map((v) => v.value).join(', ')}</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
