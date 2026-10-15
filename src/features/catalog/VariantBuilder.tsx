import { useMemo } from 'react';
import {
  Alert,
  Box,
  Checkbox,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { renderSku } from '@/utils/sku';
import type { Attribute, Category } from '@/types/catalog';
import { cartesian, comboKey, valueNames } from './shared';

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

interface VariantBuilderProps {
  attributes: Attribute[];
  category: Category | undefined;
  value: VariantPlan;
  onChange: (plan: VariantPlan) => void;
  error?: string | null;
}

/** UC-CP-02: chọn thuộc tính và giá trị → sinh tổ hợp biến thể, xem trước SKU (QT-11) */
export function VariantBuilder({ attributes, category, value, onChange, error }: VariantBuilderProps) {
  const names = useMemo(() => valueNames(attributes), [attributes]);
  const combos = useMemo(() => planCombos(value, attributes), [value, attributes]);

  const toggleAttribute = (id: string) => {
    const on = value.attributeIds.includes(id);
    onChange({
      attributeIds: on ? value.attributeIds.filter((x) => x !== id) : [...value.attributeIds, id],
      values: { ...value.values, [id]: on ? [] : value.values[id] ?? [] },
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

  // SKU dự kiến: số thứ tự chạy theo các tổ hợp được giữ, giống BE sinh tuần tự
  let seq = category?.skuNextSeq ?? 1;
  const rows = combos.map((combo) => {
    const key = comboKey(combo);
    const included = !value.excluded.includes(key);
    const labels = combo.map((id) => names.get(id) ?? '');
    const sku = included && category ? renderSku(category.skuPattern, seq++, labels) : null;
    return { key, included, labels, sku };
  });
  const includedCount = rows.filter((r) => r.included).length;

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Chọn thuộc tính làm biến thể. Không chọn thuộc tính nào thì sản phẩm có một biến thể.
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        {attributes.map((a) => {
          const on = value.attributeIds.includes(a.id);
          return (
            <Chip
              key={a.id}
              label={a.name}
              color={on ? 'primary' : 'default'}
              variant={on ? 'filled' : 'outlined'}
              onClick={() => toggleAttribute(a.id)}
            />
          );
        })}
        {!attributes.length && (
          <Typography variant="body2" color="text.secondary">
            Công ty chưa có thuộc tính nào.
          </Typography>
        )}
      </Stack>

      {attributes
        .filter((a) => value.attributeIds.includes(a.id))
        .map((a) => (
          <Stack key={a.id} direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1.5 }}>
            <Typography variant="subtitle2" sx={{ minWidth: 110, pt: 0.5 }}>
              {a.name}
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {a.values.map((v) => {
                const on = value.values[a.id]?.includes(v.id) ?? false;
                return (
                  <Chip
                    key={v.id}
                    size="small"
                    label={v.value}
                    color={on ? 'primary' : 'default'}
                    variant={on ? 'filled' : 'outlined'}
                    onClick={() => toggleValue(a.id, v.id)}
                  />
                );
              })}
            </Stack>
          </Stack>
        ))}

      <Table size="small" sx={{ mt: 1 }}>
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox" />
            <TableCell>Biến thể</TableCell>
            <TableCell>SKU dự kiến</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key || 'default'} sx={{ opacity: r.included ? 1 : 0.5 }}>
              <TableCell padding="checkbox">
                <Checkbox
                  size="small"
                  checked={r.included}
                  disabled={rows.length === 1}
                  onChange={() => toggleCombo(r.key)}
                  inputProps={{ 'aria-label': `Tạo biến thể ${r.labels.join(' / ') || 'mặc định'}` }}
                />
              </TableCell>
              <TableCell>{r.labels.join(' / ') || 'Mặc định'}</TableCell>
              <TableCell sx={{ fontFamily: 'monospace' }}>
                {r.sku ?? (r.included ? 'Chọn danh mục để xem' : '—')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
        Sẽ tạo {includedCount} biến thể. SKU chính thức do hệ thống cấp khi lưu và có thể khác bản
        xem trước nếu có người vừa tạo sản phẩm cùng danh mục.
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
}
