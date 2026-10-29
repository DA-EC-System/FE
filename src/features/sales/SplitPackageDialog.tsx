import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSplitPackage } from '@/api/fulfillment.api';
import { getProblem } from '@/api/client';
import { problemMessage } from '@/api/problemMessages';
import type { PackageSummary } from '@/types/fulfillment';
import { CONFLICT_CODES } from './CancelOrderDialog';

interface SplitPackageDialogProps {
  pkg: PackageSummary | null;
  onClose: () => void;
  onConflict: () => void;
}

/** Chia kiện chưa đóng gói: chọn số món chuyển sang kiện mới, phần còn lại ở kiện cũ */
export function SplitPackageDialog({ pkg, onClose, onConflict }: SplitPackageDialogProps) {
  const mutation = useSplitPackage();
  const [moved, setMoved] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMoved({});
    setError(null);
  }, [pkg]);

  if (!pkg) return null;
  const total = Object.values(moved).reduce((a, b) => a + b, 0);
  const valid = total > 0 && total < pkg.totalQty;

  const submit = async () => {
    setError(null);
    const part = pkg.lines
      .map((l) => ({ variantId: l.variantId, quantity: moved[l.variantId] ?? 0 }))
      .filter((l) => l.quantity > 0);
    try {
      await mutation.mutateAsync({ id: pkg.id, version: pkg.version, parts: [part] });
      toast.success(`Đã chia kiện ${pkg.code}`);
      onClose();
    } catch (e) {
      const problem = getProblem(e);
      if (problem?.code && [...CONFLICT_CODES, 'package_sealed'].includes(problem.code)) onConflict();
      else setError(problem?.errors ? Object.values(problem.errors)[0] ?? problemMessage(e) : problemMessage(e));
    }
  };

  const loading = mutation.isPending;
  return (
    <Dialog open onOpenChange={(next) => !next && !loading && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Chia kiện {pkg.code}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Nhập số món chuyển sang kiện mới. Kiện cũ phải còn ít nhất một món.</p>
        {error && <AlertMessage severity="error">{error}</AlertMessage>}
        <Table data-testid="split-lines">
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead className="w-20 text-right">Trong kiện</TableHead>
              <TableHead className="w-28 text-right">Sang kiện mới</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pkg.lines.map((l) => (
              <TableRow key={l.variantId} data-row-id={l.sku}>
                <TableCell className="font-medium">{l.sku}</TableCell>
                <TableCell className="text-right">{l.quantity}</TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    min={0}
                    max={l.quantity}
                    aria-label={`Số ${l.sku} sang kiện mới`}
                    className="h-8 text-right"
                    value={moved[l.variantId] ?? 0}
                    onChange={(e) => {
                      const n = Math.max(0, Math.min(l.quantity, Math.floor(Number(e.target.value) || 0)));
                      setMoved({ ...moved, [l.variantId]: n });
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Đóng
          </Button>
          <Button onClick={submit} disabled={!valid || loading}>
            {loading ? 'Đang chia...' : 'Chia kiện'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
