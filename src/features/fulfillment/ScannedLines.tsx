import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { VariantPicker } from '@/features/inventory/VariantPicker';
import type { StockLevel } from '@/types/inventory';
import type { ScanRow } from './scanLines';

interface ScannedLinesProps {
  rows: ScanRow[];
  onChange: (rows: ScanRow[]) => void;
  errors?: Record<string, string> | null;
  disabled?: boolean;
  /** Cần khác nhau khi một trang có nhiều bảng */
  id?: string;
  /** Nhãn theo ngữ cảnh: trang trả hàng truyền "SL yêu cầu trả", "Ngoài yêu cầu", "Thêm món ngoài yêu cầu" */
  expectedLabel?: string;
  outsideLabel?: string;
  addLabel?: string;
}

/** Bảng số kho quét thật lúc nhận: sửa số từng món, thêm món ngoài danh sách bằng tìm SKU (FE#212) */
export function ScannedLines({
  rows,
  onChange,
  errors,
  disabled,
  id = 'scan-lines',
  expectedLabel = 'Dự kiến',
  outsideLabel = 'Ngoài danh sách',
  addLabel = 'Thêm món ngoài danh sách',
}: ScannedLinesProps) {
  const setQty = (i: number, quantity: string) => onChange(rows.map((r, j) => (j === i ? { ...r, quantity } : r)));
  const add = (level: StockLevel) => {
    if (rows.some((r) => r.variantId === level.variantId)) return;
    onChange([
      ...rows,
      {
        variantId: level.variantId,
        sku: level.sku,
        productName: level.productName,
        attributesLabel: level.attributesLabel,
        expected: null,
        quantity: '1',
      },
    ]);
  };

  return (
    <div className="grid gap-3" data-testid={id}>
      {rows.length > 0 && (
        <div className="max-h-72 overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sản phẩm</TableHead>
                <TableHead className="w-20 text-right">{expectedLabel}</TableHead>
                <TableHead className="w-28">Thực nhận</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => {
                const qtyError = errors?.[`lines.${i}.quantity`];
                const variantError = errors?.[`lines.${i}.variantId`];
                return (
                  <TableRow key={r.variantId} data-row-id={r.sku}>
                    <TableCell>
                      <p className="font-medium">{r.sku}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.productName}
                        {r.attributesLabel && ` · ${r.attributesLabel}`}
                      </p>
                      {variantError && <p className="text-xs text-destructive">{variantError}</p>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.expected ?? <span className="text-xs text-muted-foreground">{outsideLabel}</span>}
                    </TableCell>
                    <TableCell>
                      <Input
                        inputMode="numeric"
                        aria-label={`Thực nhận ${r.sku}`}
                        className="h-8"
                        value={r.quantity}
                        disabled={disabled}
                        aria-invalid={Boolean(qtyError)}
                        onChange={(e) => setQty(i, e.target.value)}
                      />
                      {qtyError && <p className="mt-1 text-xs text-destructive">{qtyError}</p>}
                    </TableCell>
                    <TableCell>
                      {r.expected === null && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          aria-label={`Bỏ ${r.sku}`}
                          disabled={disabled}
                          onClick={() => onChange(rows.filter((_, j) => j !== i))}
                        >
                          Bỏ
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {errors?.lines && <p className="text-sm text-destructive">{errors.lines}</p>}
      <VariantPicker
        id={`${id}-add`}
        label={addLabel}
        takenLabel="Đã có trong bảng"
        taken={new Set(rows.map((r) => r.variantId))}
        disabled={disabled}
        onPick={add}
      />
    </div>
  );
}
