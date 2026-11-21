import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBulkEditRows, useBulkSaveVariants } from '@/api/catalog.api';
import { problemMessage } from '@/api/problemMessages';
import type { ProductDetail } from '@/types/catalog';
import { MIN_QTY_FIELD_ID, parseMinQty } from './completion';

interface ProductMinQtyCardProps {
  /** Form tạo: giá trị áp sau khi tạo (`ProductFormPage`) */
  value: string;
  onChange: (text: string) => void;
  /** Trang sửa: áp ngay cho mọi biến thể chưa lưu trữ */
  product?: ProductDetail;
  readOnly: boolean;
}

/**
 * Ngưỡng tồn mức sản phẩm (Documents/29 bước 3, cố vấn chốt câu 5): nhập một lần, áp cho mọi biến thể qua sửa hàng loạt
 * `PATCH /catalog/variants/bulk` (Documents/21 §17.5); sửa riêng từng biến thể vẫn được. Ghi đè ngưỡng riêng thì hỏi trước
 * (Thành chốt 22/11/2026).
 */
export function ProductMinQtyCard({ value, onChange, product, readOnly }: ProductMinQtyCardProps) {
  const qty = parseMinQty(value);
  const invalid = value.trim() !== '' && qty === null;
  // `reorderVersion` của từng biến thể chỉ có ở bảng sửa hàng loạt; lọc đúng sản phẩm này
  const rowsQuery = useBulkEditRows(
    { page: 1, pageSize: 200, search: product?.name ?? '' },
    { enabled: Boolean(product) && !readOnly },
  );
  const saveMut = useBulkSaveVariants();
  const [confirming, setConfirming] = useState(false);

  const live = product?.variants.filter((v) => v.businessStatus !== 'archived') ?? [];
  const rows = (rowsQuery.data?.items ?? []).filter((r) => r.productId === product?.id && live.some((v) => v.id === r.variantId));
  const differ = live.filter((v) => v.minQty !== null && v.minQty !== qty);

  const apply = async () => {
    if (qty === null || !product) return;
    setConfirming(false);
    try {
      const result = await saveMut.mutateAsync(
        rows.map((r) => ({ variantId: r.variantId, version: r.version, reorderVersion: r.reorderVersion, minQty: qty })),
      );
      if (result.failed.length) toast.warning(`Đã áp cho ${result.saved.length} biến thể; ${result.failed.length} biến thể lỗi: ${result.failed[0].message}`);
      else toast.success(`Đã áp ngưỡng tồn ${qty} cho ${result.saved.length} biến thể`);
    } catch (e) {
      toast.error(problemMessage(e));
    }
  };

  const ready = Boolean(product) && rows.length === live.length && !rowsQuery.isFetching;
  const reason = !product
    ? null
    : qty === null
      ? 'Nhập ngưỡng tồn trước'
      : !ready
        ? 'Đang tải biến thể'
        : saveMut.isPending
          ? 'Đang lưu'
          : null;

  return (
    <Card id={MIN_QTY_FIELD_ID} tabIndex={-1} className="outline-none">
      <CardHeader>
        <CardTitle>Ngưỡng tồn</CardTitle>
        <CardDescription>
          Tồn có thể bán xuống dưới số này thì app nhắc nhập thêm. Nhập một lần cho cả sản phẩm; sửa riêng từng biến thể ở nút
          Sửa trên dòng biến thể.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="product-min-qty">Ngưỡng tồn (áp cho mọi biến thể)</Label>
          <Input
            id="product-min-qty"
            inputMode="numeric"
            className="w-40"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={invalid || undefined}
            readOnly={readOnly}
          />
          {invalid && <p className="text-sm text-destructive">Nhập số nguyên từ 0</p>}
        </div>
        {product && !readOnly && (
          <Button
            type="button"
            variant="outline"
            disabled={Boolean(reason)}
            title={reason ?? undefined}
            onClick={() => (differ.length ? setConfirming(true) : void apply())}
          >
            Áp cho mọi biến thể
          </Button>
        )}
        {!product && <p className="text-sm text-muted-foreground">Áp cho mọi biến thể ngay sau khi tạo.</p>}
      </CardContent>
      <ConfirmDialog
        open={confirming}
        title="Ghi đè ngưỡng tồn riêng?"
        message={`Áp ${qty ?? ''} cho ${live.length} biến thể; ${differ.length} biến thể đang đặt số khác sẽ bị đổi.`}
        confirmLabel="Áp cho mọi biến thể"
        loading={saveMut.isPending}
        onConfirm={apply}
        onClose={() => setConfirming(false)}
      />
    </Card>
  );
}
