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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PricelistItem } from '@/types/pricing';
import { applyBulk, bulkFormSchema, type BulkForm, type BulkMode, type BulkResult } from './shared';

interface BulkPriceDialogProps {
  open: boolean;
  rows: PricelistItem[];
  isChannel: boolean;
  /** Giá đang hiện trên lưới, đã gồm thay đổi chưa lưu */
  current: (variantId: string) => number | null;
  onClose: () => void;
  onApply: (result: BulkResult) => void;
}

const MODES: { value: BulkMode; label: string; channelOnly?: boolean }[] = [
  { value: 'set', label: 'Đặt cùng một giá' },
  { value: 'percent', label: 'Tăng / giảm theo %' },
  { value: 'amount', label: 'Tăng / giảm số tiền' },
  { value: 'standard', label: 'Chép giá chuẩn', channelOnly: true },
  { value: 'clear', label: 'Bỏ giá' },
];

const EMPTY: BulkForm = { mode: 'set', value: '', roundTo: 1000 };

/** UC-CP-03 bước 6: sửa giá hàng loạt các dòng đã chọn; chỉ đổi bản nháp, bấm Lưu mới gửi (AC-G8) */
export function BulkPriceDialog({ open, rows, isChannel, current, onClose, onApply }: BulkPriceDialogProps) {
  const [form, setForm] = useState<BulkForm>(EMPTY);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setTouched(false);
    }
  }, [open]);

  const parsed = bulkFormSchema.safeParse(form);
  const error = parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Dữ liệu chưa hợp lệ');
  // Vài nghìn dòng: tính lại mỗi lần gõ vẫn nhanh
  const preview = parsed.success ? applyBulk(rows, current, parsed.data, isChannel) : null;

  const needsValue = form.mode === 'set' || form.mode === 'percent' || form.mode === 'amount';
  const canRound = form.mode === 'percent' || form.mode === 'amount';
  const valueLabel = form.mode === 'set' ? 'Giá mới' : form.mode === 'percent' ? 'Phần trăm' : 'Số tiền';
  const showError = touched && error;

  const submit = () => {
    setTouched(true);
    if (preview && preview.changes.size) onApply(preview);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sửa giá {rows.length} biến thể</DialogTitle>
          <DialogDescription>Giá mới chỉ được ghi lại khi bấm Lưu trên trang bảng giá.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="bulk-mode">Cách sửa</Label>
            <Select
              value={form.mode}
              onValueChange={(mode) => {
                setForm({ ...form, mode: mode as BulkMode, value: '' });
                setTouched(false);
              }}
            >
              <SelectTrigger id="bulk-mode" className="w-full" aria-label="Cách sửa">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODES.filter((m) => isChannel || !m.channelOnly).map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsValue && (
            <div className="grid gap-1.5">
              <Label htmlFor="bulk-value">{valueLabel}</Label>
              <div className="relative">
                <Input
                  id="bulk-value"
                  value={form.value}
                  autoFocus
                  inputMode="decimal"
                  aria-invalid={Boolean(showError)}
                  className="pe-8 text-right"
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  onBlur={() => setTouched(true)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                />
                <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {form.mode === 'percent' ? '%' : 'đ'}
                </span>
              </div>
              <p className={showError ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
                {showError || (form.mode === 'set' ? 'Số nguyên đồng, vd 150000' : 'Số âm để giảm, vd -10')}
              </p>
            </div>
          )}

          {canRound && (
            <div className="grid gap-1.5">
              <Label htmlFor="bulk-round">Làm tròn</Label>
              <Select
                value={String(form.roundTo)}
                onValueChange={(v) => setForm({ ...form, roundTo: Number(v) as BulkForm['roundTo'] })}
              >
                <SelectTrigger id="bulk-round" className="w-full" aria-label="Làm tròn">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Không làm tròn</SelectItem>
                  <SelectItem value="100">Tới 100 đ</SelectItem>
                  <SelectItem value="1000">Tới 1.000 đ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {canRound && isChannel && (
            <p className="text-sm text-muted-foreground">Dòng chưa có giá riêng lấy giá chuẩn làm gốc.</p>
          )}

          {preview && (
            <AlertMessage severity={preview.changes.size ? 'info' : 'warning'}>
              <span data-testid="bulk-preview">
                Sẽ đổi giá {preview.changes.size} biến thể
                {preview.noBase > 0 && `; bỏ qua ${preview.noBase} biến thể chưa có giá để tính`}
                {preview.outOfRange > 0 &&
                  `; bỏ qua ${preview.outOfRange} biến thể vì giá ra âm hoặc quá 10 tỷ`}
                .
              </span>
            </AlertMessage>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="button" onClick={submit} disabled={Boolean(preview && !preview.changes.size)}>
            Áp dụng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
