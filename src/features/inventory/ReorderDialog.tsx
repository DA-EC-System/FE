import { useEffect, useState } from 'react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSetReorderRule } from '@/api/inventory.api';
import { getErrorMessage, getProblem } from '@/api/client';
import { conflictCurrent } from '@/features/identity/shared';
import type { StockLevel } from '@/types/inventory';
import { formatQty, minQtySchema } from './shared';

interface ReorderDialogProps {
  level: StockLevel | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

/** UC-IN-02: đặt ngưỡng tồn tối thiểu cho một biến thể; ô trống là bỏ ngưỡng */
export function ReorderDialog({ level, onClose, onDone }: ReorderDialogProps) {
  const setMut = useSetReorderRule();
  const [value, setValue] = useState('');
  const [version, setVersion] = useState(0);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ severity: 'warning' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    if (level) {
      setValue(level.minQty === null ? '' : String(level.minQty));
      setVersion(level.reorderVersion);
      setFieldError(null);
      setNotice(null);
    }
  }, [level]);

  const submit = async () => {
    if (!level) return;
    // Kiểm ở FE trước, số sai không gửi request (AC-K5)
    const parsed = minQtySchema.safeParse(value);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Ngưỡng sai định dạng');
      return;
    }
    setNotice(null);
    try {
      const saved = await setMut.mutateAsync({ variantId: level.variantId, minQty: parsed.data, version });
      onDone(
        saved.minQty === null
          ? `Đã bỏ ngưỡng tồn của ${saved.sku}`
          : `Đã đặt ngưỡng ${formatQty(saved.minQty)} cho ${saved.sku}` +
              (saved.belowMin ? '; khả dụng đang dưới ngưỡng' : ''),
      );
    } catch (e) {
      const problem = getProblem(e);
      const latest = conflictCurrent<StockLevel>(e);
      if (problem?.code === 'version_conflict' && latest) {
        setValue(latest.minQty === null ? '' : String(latest.minQty));
        setVersion(latest.reorderVersion);
        setNotice({
          severity: 'warning',
          msg: 'Ngưỡng vừa được người khác sửa. Ô đã hiện số mới nhất, chưa có gì thay đổi.',
        });
        return;
      }
      if (problem?.errors?.minQty) setFieldError(problem.errors.minQty);
      else setNotice({ severity: 'error', msg: getErrorMessage(e) });
    }
  };

  const busy = setMut.isPending;

  return (
    <Dialog open={Boolean(level)} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Ngưỡng tồn tối thiểu</DialogTitle>
          {level && (
            <DialogDescription>
              <span className="font-medium text-foreground">{level.sku}</span> · {level.productName}
              {level.attributesLabel && ` · ${level.attributesLabel}`}
            </DialogDescription>
          )}
        </DialogHeader>
        {notice && <AlertMessage severity={notice.severity}>{notice.msg}</AlertMessage>}
        {level && (
          <div className="grid gap-4">
            <p className="text-sm">
              Khả dụng hiện tại: <strong>{formatQty(level.available)}</strong>
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="min-qty">Ngưỡng tối thiểu</Label>
              <Input
                id="min-qty"
                value={value}
                autoFocus
                inputMode="numeric"
                aria-invalid={Boolean(fieldError)}
                onChange={(e) => {
                  setValue(e.target.value);
                  setFieldError(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
              <p className={fieldError ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
                {fieldError ??
                  'Khả dụng dưới ngưỡng thì Nhân viên kho và Admin nhận thông báo. Để trống là bỏ ngưỡng.'}
              </p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button type="button" onClick={submit} disabled={busy}>
            {busy ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
