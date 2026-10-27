import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAddRequestLine, usePurchaseRequests, useSuppliers } from '@/api/purchasing.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/router/routes';
import type { StockLevel } from '@/types/inventory';
import type { PurchaseRequest } from '@/types/purchasing';
import { formatQty } from './shared';

const NEW_DRAFT = '__new__';

/** Gợi ý số cần nhập: bù lên tới ngưỡng, trừ phần đang về; ít nhất 1 */
export const suggestedQty = (level: StockLevel) => Math.max(1, (level.minQty ?? 0) - level.available - level.incoming);

/**
 * Gợi ý nhập lại (sơ đồ B2) đưa vào đề nghị nhập nháp (sơ đồ A1): chọn nháp có sẵn hoặc lập nháp mới theo NCC.
 * Trùng biến thể trong nháp thì cộng dồn số lượng.
 */
export function AddToRequestDialog({
  level,
  onClose,
  onDone,
}: {
  level: StockLevel | null;
  onClose: () => void;
  onDone: (request: PurchaseRequest) => void;
}) {
  const open = Boolean(level);
  const { companyContext } = useAuth();
  const companyId = companyContext?.companyId ?? '';
  const drafts = usePurchaseRequests({ status: 'draft', pageSize: 50 }, { enabled: open }).data?.items ?? [];
  const suppliers = (useSuppliers({}, { enabled: open }).data ?? []).filter((s) => s.active);
  const mut = useAddRequestLine();

  const [target, setTarget] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [qty, setQty] = useState('');
  const [errs, setErrs] = useState<{ target?: string; supplierId?: string; quantity?: string }>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (level) {
      setTarget('');
      setSupplierId('');
      setQty(String(suggestedQty(level)));
      setErrs({});
      setError(null);
    }
  }, [level]);

  // Có nháp thì mặc định chọn nháp đầu tiên, không thì lập nháp mới
  const chosen = target || (drafts[0]?.id ?? NEW_DRAFT);

  const submit = async () => {
    if (!level) return;
    const n = Number(qty.trim());
    const next = {
      quantity: !qty.trim() ? 'Nhập số lượng' : !Number.isInteger(n) || n < 1 ? 'Số lượng là số nguyên từ 1' : undefined,
      supplierId: chosen === NEW_DRAFT && !supplierId ? 'Chọn nhà cung cấp cho đề nghị mới' : undefined,
    };
    setErrs(next);
    setError(null);
    if (next.quantity || next.supplierId) return;
    try {
      const request = await mut.mutateAsync({
        requestId: chosen === NEW_DRAFT ? null : chosen,
        supplierId: chosen === NEW_DRAFT ? supplierId : null,
        variantId: level.variantId,
        quantity: n,
      });
      onDone(request);
    } catch (e) {
      const fieldErrors = getProblem(e)?.errors ?? {};
      if (fieldErrors.quantity || fieldErrors.supplierId || fieldErrors.requestId) {
        setErrs({ quantity: fieldErrors.quantity, supplierId: fieldErrors.supplierId, target: fieldErrors.requestId });
      } else setError(problemMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !mut.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Thêm vào đề nghị nhập</DialogTitle>
          <DialogDescription>
            {level?.sku} · khả dụng {formatQty(level?.available ?? 0)}, ngưỡng {level?.minQty === null ? '—' : formatQty(level?.minQty ?? 0)}
            {level?.incoming ? `, đang về ${formatQty(level.incoming)}` : ''}
          </DialogDescription>
        </DialogHeader>
        {error && <AlertMessage severity="error">{error}</AlertMessage>}
        <div className="grid gap-1.5">
          <Label htmlFor="add-target">Đề nghị</Label>
          <Select value={chosen} onValueChange={setTarget}>
            <SelectTrigger id="add-target" className="w-full" aria-invalid={Boolean(errs.target)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {drafts.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.number} · {d.supplier.name} ({d.lineCount} dòng)
                </SelectItem>
              ))}
              <SelectItem value={NEW_DRAFT}>Lập đề nghị nháp mới</SelectItem>
            </SelectContent>
          </Select>
          {errs.target && <p className="text-sm text-destructive">{errs.target}</p>}
        </div>
        {chosen === NEW_DRAFT && (
          <div className="grid gap-1.5">
            <Label htmlFor="add-supplier">Nhà cung cấp</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger id="add-supplier" className="w-full" aria-invalid={Boolean(errs.supplierId)}>
                <SelectValue placeholder="Chọn nhà cung cấp" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errs.supplierId && <p className="text-sm text-destructive">{errs.supplierId}</p>}
            {!suppliers.length && (
              <p className="text-xs text-muted-foreground">
                Chưa có nhà cung cấp.{' '}
                <Link className="text-primary hover:underline" to={ROUTES.company.purchasing(companyId, 'suppliers')}>
                  Thêm nhà cung cấp
                </Link>
              </p>
            )}
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="add-qty">Số lượng</Label>
          <Input
            id="add-qty"
            inputMode="numeric"
            value={qty}
            aria-invalid={Boolean(errs.quantity)}
            onChange={(e) => setQty(e.target.value)}
          />
          {errs.quantity && <p className="text-sm text-destructive">{errs.quantity}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>
            Huỷ
          </Button>
          <Button disabled={mut.isPending} onClick={submit}>
            {mut.isPending ? 'Đang thêm...' : 'Thêm vào đề nghị'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
