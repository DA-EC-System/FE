import { AlertMessage } from '@/components/common/AlertMessage';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { PlatformAttribute, VariantCapabilities } from '@/types/shop';
import { CUSTOM_AXIS, type ProductAxis, type SpecDraft } from '../specDraft';
import { axisFieldId, valueFieldId } from './fieldIds';

const NONE = '__none__';

interface VariantsStepProps {
  label: string;
  axes: ProductAxis[];
  /** Sales attribute của leaf; null khi chưa tải được attribute */
  sales: PlatformAttribute[] | null;
  /** Luật trục của leaf (Documents/21 §18.8.3); null khi chưa có leaf hoặc BE chưa trả */
  caps: VariantCapabilities | null;
  draft: SpecDraft;
  errors: Record<string, string>;
  onAxis: (axis: ProductAxis, code: string) => void;
  onValue: (valueId: string, optionId: string | null) => void;
}

/** Thuộc tính biến thể: mỗi thuộc tính biến thể của sản phẩm ↔ sales attribute của sàn (hoặc tên tự đặt); mỗi giá trị ↔ giá trị chuẩn hoặc để trống */
export function VariantsStep({ label, axes, sales, caps, draft, errors, onAxis, onValue }: VariantsStepProps) {
  if (!axes.length) {
    return <AlertMessage severity="info">Sản phẩm không có biến thể: đăng một SKU, không gửi thuộc tính biến thể.</AlertMessage>;
  }
  const list = sales ?? [];
  return (
    <div className="grid gap-4">
      <AlertMessage severity={caps && axes.length > caps.maxAxes ? 'warning' : 'info'} alert={Boolean(caps && axes.length > caps.maxAxes)}>
        {/* Bọc một đoạn: AlertDescription là grid, phần tử inline (<b>) đứng riêng một dòng (FE#459) */}
        <p>
          Mỗi thuộc tính biến thể của sản phẩm khớp với một thuộc tính biến thể của {label}; Commerio đã chọn sẵn theo loại thuộc
          tính và ánh xạ của công ty. Giá trị khớp lựa chọn chuẩn thì sản phẩm hiện đúng trong bộ lọc của sàn.
          {caps && (
            <>
              {' '}
              Category này nhận tối đa <b>{caps.maxAxes}</b> thuộc tính biến thể
              {caps.customAxisName ? ', nhận cả tên tự đặt.' : ', chỉ nhận thuộc tính biến thể có sẵn của category, không nhận tên tự đặt.'}
              {axes.length > caps.maxAxes && ` Sản phẩm có ${axes.length} thuộc tính biến thể nên chưa đăng được vào category này.`}
            </>
          )}
        </p>
      </AlertMessage>
      {caps?.salesRequired.some((c) => !axes.some((x) => draft.axisMap[x.attributeId] === c)) && (
        <AlertMessage severity="warning" alert>
          {label} bắt buộc category này có thuộc tính biến thể{' '}
          {caps.salesRequired
            .filter((c) => !axes.some((x) => draft.axisMap[x.attributeId] === c))
            .map((c) => list.find((s) => s.code === c)?.label ?? c)
            .join(', ')}
          . Chọn một thuộc tính biến thể của sản phẩm khớp với thuộc tính này.
        </AlertMessage>
      )}
      {axes.map((axis) => {
        const code = draft.axisMap[axis.attributeId] ?? '';
        const attr = list.find((s) => s.code === code);
        const axisError = errors[`axisMap.${axis.attributeId}`];
        return (
          <section key={axis.attributeId} className="rounded-lg border">
            <h3 className="border-b bg-table-head px-4 py-2 text-sm font-semibold">
              Thuộc tính biến thể “{axis.name}” <span className="font-normal text-muted-foreground">· {axis.values.length} giá trị</span>
            </h3>
            <div className="grid gap-3 p-4">
              <div className="grid max-w-md gap-1.5">
                <Label htmlFor={axisFieldId(axis.attributeId)}>Khớp với thuộc tính biến thể của {label}</Label>
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
                    {(caps?.customAxisName !== false || code === CUSTOM_AXIS) && (
                      <SelectItem value={CUSTOM_AXIS} disabled={caps?.customAxisName === false}>
                        Tên tự đặt “{axis.name}”
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {axisError ? (
                  <p className="text-xs text-destructive-text">{axisError}</p>
                ) : (
                  code === CUSTOM_AXIS &&
                  caps?.customAxisName === false && (
                    <p className="text-xs text-destructive-text">{label} không nhận tên tự đặt ở category này. Chọn một thuộc tính có sẵn.</p>
                  )
                )}
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
