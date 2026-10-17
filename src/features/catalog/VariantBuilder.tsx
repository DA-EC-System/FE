import { useMemo } from 'react';
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
import type { Attribute, Category } from '@/types/catalog';
import { cartesian, comboKey, valueIndex } from './shared';

export const MAX_VARIANTS = 100;

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

/** Lỗi của kế hoạch biến thể, null nếu tạo được */
export function planError(plan: VariantPlan, attributes: Attribute[]): string | null {
  const empty = attributes.find((a) => plan.attributeIds.includes(a.id) && !plan.values[a.id]?.length);
  if (empty) return `Chọn ít nhất một giá trị cho ${empty.name}`;
  const count = planCombos(plan, attributes).filter((c) => !plan.excluded.includes(comboKey(c))).length;
  if (!count) return 'Cần ít nhất một biến thể';
  if (count > MAX_VARIANTS) return `Tối đa ${MAX_VARIANTS} biến thể mỗi lần tạo`;
  return null;
}

/** Bảng xem trước chỉ vẽ chừng này dòng; quá thì đằng nào cũng không tạo được */
const MAX_ROWS_SHOWN = MAX_VARIANTS + 20;

interface VariantBuilderProps {
  attributes: Attribute[];
  category: Category | undefined;
  value: VariantPlan;
  onChange: (plan: VariantPlan) => void;
  /** Lỗi khi bấm Lưu hoặc errors.variants từ BE */
  error?: string | null;
}

/** UC-CP-02: chọn thuộc tính và giá trị → sinh tổ hợp biến thể, xem trước SKU (QT-11) */
export function VariantBuilder({ attributes, category, value, onChange, error }: VariantBuilderProps) {
  const index = useMemo(() => valueIndex(attributes), [attributes]);
  const combos = useMemo(() => planCombos(value, attributes), [value, attributes]);

  const toggleAttribute = (id: string) => {
    const on = value.attributeIds.includes(id);
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
  let seq = category?.skuNextSeq ?? 1;
  const rows = combos.map((combo) => {
    const key = comboKey(combo);
    const included = !value.excluded.includes(key);
    const labels = combo.map((id) => index.get(id)?.value ?? '');
    const codes = combo.map((id) => index.get(id)?.code ?? '');
    const sku = included && category ? renderSku(category.skuPattern, seq++, codes) : null;
    return { key, included, labels, sku };
  });
  const includedCount = rows.filter((r) => r.included).length;
  // Báo ngay khi vượt, không đợi bấm Lưu
  const tooMany = includedCount > MAX_VARIANTS ? `Tối đa ${MAX_VARIANTS} biến thể mỗi lần tạo` : null;
  const shownError = tooMany ?? error;

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Chọn thuộc tính làm biến thể. Không chọn thuộc tính nào thì sản phẩm có một biến thể.
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Thuộc tính">
        {attributes.map((a) => (
          <ToggleChip
            key={a.id}
            on={value.attributeIds.includes(a.id)}
            onClick={() => toggleAttribute(a.id)}
          >
            {a.name}
          </ToggleChip>
        ))}
        {!attributes.length && (
          <p className="text-sm text-muted-foreground">Công ty chưa có thuộc tính nào.</p>
        )}
      </div>

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
              <TableHead>Biến thể</TableHead>
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
                      aria-label={`Tạo biến thể ${label}`}
                    />
                  </TableCell>
                  <TableCell>{label}</TableCell>
                  <TableCell className="font-mono">
                    {r.sku ?? (r.included ? 'Chọn danh mục để xem' : '—')}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {rows.length > MAX_ROWS_SHOWN && (
        <p className="text-xs text-muted-foreground">
          Chỉ hiện {MAX_ROWS_SHOWN} trên {rows.length} tổ hợp.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Sẽ tạo <Badge variant="secondary">{includedCount}</Badge> biến thể. SKU chính thức do hệ thống
        cấp khi lưu và có thể khác bản xem trước nếu có người vừa tạo sản phẩm cùng danh mục.
      </p>
      {shownError && <AlertMessage severity="error">{shownError}</AlertMessage>}
    </div>
  );
}

function ToggleChip({
  on,
  small,
  onClick,
  children,
}: {
  on: boolean;
  small?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'rounded-full border font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
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
