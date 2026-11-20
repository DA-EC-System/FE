import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { renderSku } from '@/utils/sku';
import type { Attribute, ProductAxis, ProductSettings } from '@/types/catalog';
import { cartesian, comboKey, valueIndex } from './shared';

export const MAX_VARIANTS = 100;
/** Tối đa 2 trục phân loại theo Lazada `VARIATION_SIZE_LIMIT` (Documents/25 §5.4) */
export const MAX_AXES = 2;

/** Thuộc tính đã chọn, giá trị đã chọn của từng thuộc tính, tổ hợp bị bỏ */
export interface VariantPlan {
  attributeIds: string[];
  values: Record<string, string[]>;
  excluded: string[];
}

export const emptyPlan: VariantPlan = { attributeIds: [], values: {}, excluded: [] };

/** Các tổ hợp theo thứ tự thuộc tính trong danh sách, kể cả tổ hợp bị bỏ */
export function planCombos(plan: VariantPlan, attributes: Attribute[]): string[][] {
  const order = attributes.filter((a) => plan.attributeIds.includes(a.id));
  // Giữ thứ tự giá trị như trong thuộc tính, không theo thứ tự bấm
  return cartesian(
    order.map((a) => a.values.map((v) => v.id).filter((id) => plan.values[a.id]?.includes(id))),
  );
}

/**
 * Body `axes`, `variants` của `POST /catalog/products` (Documents/21 §5.2) từ kế hoạch chọn thuộc tính có sẵn: mỗi
 * thuộc tính đã chọn là một trục gửi `attributeId` và giá trị kèm `id`; `options` là chữ của giá trị theo thứ tự trục
 */
export function planBody(plan: VariantPlan, attributes: Attribute[]): { axes: ProductAxis[]; variants: { options: string[] }[] } {
  const order = attributes.filter((a) => plan.attributeIds.includes(a.id));
  const axes = order.map((a) => ({
    attributeId: a.id,
    values: a.values.filter((x) => plan.values[a.id]?.includes(x.id)).map((x) => ({ id: x.id, value: x.value })),
  }));
  const text = new Map(order.flatMap((a) => a.values.map((x) => [x.id, x.value] as const)));
  const variants = planCombos(plan, attributes)
    .filter((c) => !plan.excluded.includes(comboKey(c)))
    .map((c) => ({ options: c.map((id) => text.get(id) ?? '') }));
  return { axes, variants };
}

/** Lỗi của kế hoạch biến thể, null nếu tạo được */
export function planError(plan: VariantPlan, attributes: Attribute[]): string | null {
  if (plan.attributeIds.length > MAX_AXES) return `Tối đa ${MAX_AXES} thuộc tính phân loại`;
  const empty = attributes.find((a) => plan.attributeIds.includes(a.id) && !plan.values[a.id]?.length);
  if (empty) return `Chọn ít nhất một giá trị cho ${empty.name}`;
  const count = planCombos(plan, attributes).filter((c) => !plan.excluded.includes(comboKey(c))).length;
  if (!count) return 'Cần ít nhất một variant';
  if (count > MAX_VARIANTS) return `Tối đa ${MAX_VARIANTS} variant mỗi lần tạo`;
  return null;
}

/** Bảng xem trước chỉ vẽ chừng này dòng; quá thì đằng nào cũng không tạo được */
const MAX_ROWS_SHOWN = MAX_VARIANTS + 20;

interface VariantBuilderProps {
  attributes: Attribute[];
  /** Mẫu SKU và số thứ tự kế tiếp của công ty (`GET /catalog/settings`) */
  settings: ProductSettings | undefined;
  value: VariantPlan;
  onChange: (plan: VariantPlan) => void;
  /** Lỗi khi bấm Lưu hoặc errors.variants từ BE */
  error?: string | null;
  /** Danh sách thuộc tính đang tải */
  loading?: boolean;
}

/** UC-CP-02: chọn thuộc tính và giá trị → sinh tổ hợp biến thể, xem trước SKU (QT-11) */
export function VariantBuilder({ attributes, settings, value, onChange, error, loading }: VariantBuilderProps) {
  const index = useMemo(() => valueIndex(attributes), [attributes]);
  const combos = useMemo(() => planCombos(value, attributes), [value, attributes]);

  const axesFull = value.attributeIds.length >= MAX_AXES;
  const toggleAttribute = (id: string) => {
    const on = value.attributeIds.includes(id);
    if (!on && axesFull) return;
    onChange({
      attributeIds: on ? value.attributeIds.filter((x) => x !== id) : [...value.attributeIds, id],
      values: { ...value.values, [id]: on ? [] : (value.values[id] ?? []) },
      excluded: [],
    });
  };

  const toggleValue = (attributeId: string, valueId: string) => {
    const current = value.values[attributeId] ?? [];
    onChange({
      ...value,
      values: {
        ...value.values,
        [attributeId]: current.includes(valueId)
          ? current.filter((x) => x !== valueId)
          : [...current, valueId],
      },
    });
  };

  const toggleCombo = (key: string) =>
    onChange({
      ...value,
      excluded: value.excluded.includes(key)
        ? value.excluded.filter((x) => x !== key)
        : [...value.excluded, key],
    });

  // SKU dự kiến: số thứ tự chạy theo các tổ hợp được giữ từ skuNextSeq, giống BE sinh tuần tự (AC-7)
  let seq = settings?.skuNextSeq ?? 1;
  const rows = combos.map((combo) => {
    const key = comboKey(combo);
    const included = !value.excluded.includes(key);
    const labels = combo.map((id) => index.get(id)?.value ?? '');
    const codes = combo.map((id) => index.get(id)?.code ?? '');
    const sku = included && settings ? renderSku(settings.skuPattern, seq++, codes) : null;
    return { key, included, labels, sku };
  });
  const includedCount = rows.filter((r) => r.included).length;
  // Báo ngay khi vượt, không đợi bấm Lưu
  const tooMany = includedCount > MAX_VARIANTS ? `Tối đa ${MAX_VARIANTS} variant mỗi lần tạo` : null;
  const shownError = tooMany ?? error;

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Chọn tối đa {MAX_AXES} thuộc tính phân loại để chia variant (vd Màu, Cỡ). Không chọn thì sản phẩm chỉ có
        một variant &lsquo;Mặc định&rsquo;.
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Thuộc tính phân loại">
        {attributes.map((a) => (
          <ToggleChip
            key={a.id}
            on={value.attributeIds.includes(a.id)}
            disabled={axesFull && !value.attributeIds.includes(a.id)}
            title={axesFull && !value.attributeIds.includes(a.id) ? `Tối đa ${MAX_AXES} thuộc tính phân loại` : undefined}
            onClick={() => toggleAttribute(a.id)}
          >
            {a.name}
          </ToggleChip>
        ))}
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" />
            Đang tải thuộc tính phân loại…
          </p>
        ) : (
          !attributes.length && <p className="text-sm text-muted-foreground">Chưa có thuộc tính phân loại nào. Tạo ở trang Nhóm hàng &amp; thuộc tính.</p>
        )}
      </div>
      {axesFull && attributes.length > MAX_AXES && (
        <p className="text-xs text-muted-foreground" data-testid="axes-limit">
          Đã chọn đủ {MAX_AXES} thuộc tính phân loại. Bỏ một cái để chọn cái khác.
        </p>
      )}

      {attributes
        .filter((a) => value.attributeIds.includes(a.id))
        .map((a) => (
          <div key={a.id} className="flex flex-col gap-2 sm:flex-row" role="group" aria-label={a.name}>
            <span className="min-w-28 pt-1 text-sm font-medium">{a.name}</span>
            <div className="flex flex-wrap gap-1.5">
              {a.values.map((v) => (
                <ToggleChip
                  key={v.id}
                  small
                  on={value.values[a.id]?.includes(v.id) ?? false}
                  onClick={() => toggleValue(a.id, v.id)}
                >
                  {v.value}
                </ToggleChip>
              ))}
            </div>
          </div>
        ))}

      <div className="overflow-x-auto rounded-md border">
        <Table data-testid="variant-plan">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Variant</TableHead>
              <TableHead>SKU dự kiến</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, MAX_ROWS_SHOWN).map((r) => {
              const label = r.labels.join(' / ') || 'Mặc định';
              return (
                <TableRow key={r.key || 'default'} className={cn(!r.included && 'opacity-50')}>
                  <TableCell>
                    <Checkbox
                      checked={r.included}
                      disabled={rows.length === 1}
                      onCheckedChange={() => toggleCombo(r.key)}
                      aria-label={`Tạo variant ${label}`}
                    />
                  </TableCell>
                  <TableCell>{label}</TableCell>
                  <TableCell className="font-mono">
                    {r.sku ?? (r.included ? 'Đang tải mẫu SKU…' : '—')}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {rows.length > MAX_ROWS_SHOWN && (
        <p className="text-xs text-muted-foreground">
          Chỉ hiện {MAX_ROWS_SHOWN} trên {rows.length} variant.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Sẽ tạo <Badge variant="secondary">{includedCount}</Badge> variant. SKU thật cấp khi lưu, có thể lệch bản xem trước nếu có
        người vừa tạo sản phẩm khác.
      </p>
      {shownError && <AlertMessage severity="error">{shownError}</AlertMessage>}
    </div>
  );
}

function ToggleChip({
  on,
  small,
  disabled,
  title,
  onClick,
  children,
}: {
  on: boolean;
  small?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        'rounded-full border font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        small ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        on
          ? 'border-primary bg-primary text-primary-foreground'
          : 'bg-background hover:bg-accent hover:text-accent-foreground',
      )}
    >
      {children}
    </button>
  );
}
