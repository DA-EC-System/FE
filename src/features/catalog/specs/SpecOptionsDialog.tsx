import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { AlertMessage } from '@/components/common/AlertMessage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAddSpecOption, useDeleteSpecOption, useSpecFields } from '@/api/catalog.api';
import { getProblem } from '@/api/client';
import { problemCode, problemMessage } from '@/api/problemMessages';
import type { SpecField } from '@/types/catalog';
import { splitByScope } from '../scope';
import { SPEC_INPUT_LABELS, hasOptions } from './specLabels';

interface SpecOptionsDialogProps {
  /** Thông số chuẩn nền tảng đang mở; null là đóng */
  field: SpecField | null;
  onClose: () => void;
}

/**
 * Xem thông số chuẩn và thêm lựa chọn riêng của công ty (Documents/21 §5.6, chốt 4): thông số và lựa chọn chuẩn chỉ đọc;
 * lựa chọn riêng thêm bằng `POST`, xoá bằng `DELETE /catalog/spec-fields/:id/options` (không version)
 */
export function SpecOptionsDialog({ field, onClose }: SpecOptionsDialogProps) {
  const live = useSpecFields({ enabled: Boolean(field) }).data?.find((f) => f.id === field?.id) ?? field;
  const addMut = useAddSpecOption();
  const deleteMut = useDeleteSpecOption();
  const [value, setValue] = useState('');
  const [error, setError] = useState<{ value?: string; form?: string }>({});

  useEffect(() => {
    if (field) {
      setValue('');
      setError({});
    }
  }, [field]);

  const options = [...(live?.options ?? [])].sort((a, b) => a.position - b.position);
  const { platform, company } = splitByScope(options);
  const canAdd = Boolean(live && hasOptions(live.input));

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!live) return;
    const v = value.trim();
    if (!v) return setError({ value: 'Nhập lựa chọn' });
    if (v.length > 60) return setError({ value: 'Tối đa 60 ký tự' });
    setError({});
    try {
      const created = await addMut.mutateAsync({ fieldId: live.id, value: v });
      toast.success(`Đã thêm ${created.value} vào ${live.name}`);
      setValue('');
    } catch (err) {
      const fields = getProblem(err)?.errors ?? {};
      if (problemCode(err) === 'name_taken') setError({ value: fields.value ?? 'Đã có lựa chọn này' });
      else if (fields.value) setError({ value: fields.value });
      else setError({ form: problemMessage(err) });
    }
  };

  const remove = async (id: string, label: string) => {
    if (!live) return;
    try {
      await deleteMut.mutateAsync({ fieldId: live.id, optionId: id });
      toast.success(`Đã xoá ${label}`);
    } catch (err) {
      toast.warning(problemCode(err) === 'in_use' ? `Không xoá được ${label}: đang có sản phẩm dùng.` : problemMessage(err));
    }
  };

  const busy = addMut.isPending || deleteMut.isPending;

  return (
    <Dialog open={Boolean(field)} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{live?.name}</DialogTitle>
          <DialogDescription>
            Thông số chuẩn của nền tảng ({live && SPEC_INPUT_LABELS[live.input]}
            {live?.unit ? `, ${live.unit}` : ''}). Tên, kiểu nhập và lựa chọn chuẩn dùng chung mọi công ty.
            {canAdd && ' Công ty thêm được lựa chọn riêng.'}
          </DialogDescription>
        </DialogHeader>

        {error.form && <AlertMessage severity="error">{error.form}</AlertMessage>}

        {canAdd ? (
          <>
            <section className="grid gap-2" aria-label="Lựa chọn chuẩn">
              <h3 className="text-sm font-medium">
                Mặc định của hệ thống <span className="font-normal text-muted-foreground tabular-nums">{platform.length}</span>
              </h3>
              {platform.length ? (
                <div className="flex flex-wrap gap-1">
                  {platform.map((o) => (
                    <Badge key={o.id} variant="outline">
                      {o.value}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Không có lựa chọn chuẩn</p>
              )}
            </section>

            <section className="grid gap-2" aria-label="Lựa chọn riêng của công ty">
              <h3 className="text-sm font-medium">
                Tự tạo <span className="font-normal text-muted-foreground tabular-nums">{company.length}</span>
              </h3>
              {company.length ? (
                <ul className="flex flex-wrap gap-1">
                  {company.map((o) => (
                    <li key={o.id}>
                      <Badge variant="secondary" className="gap-1 pr-0.5">
                        {o.value}
                        <button
                          type="button"
                          className="inline-flex size-6 cursor-pointer items-center justify-center rounded-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={o.inUse ? `${o.value} đang có sản phẩm dùng, không xoá được` : `Xoá ${o.value}`}
                          title={o.inUse ? 'Đang có sản phẩm dùng, không xoá được' : `Xoá ${o.value}`}
                          disabled={busy || o.inUse}
                          onClick={() => void remove(o.id, o.value)}
                        >
                          <X className="size-3.5" />
                        </button>
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Chưa có lựa chọn riêng</p>
              )}
            </section>

            <form onSubmit={add} noValidate className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
              <div className="grid gap-1.5">
                <Label htmlFor="spec-option-new">Lựa chọn mới</Label>
                <Input
                  id="spec-option-new"
                  value={value}
                  maxLength={60}
                  onChange={(e) => setValue(e.target.value)}
                  aria-invalid={Boolean(error.value)}
                  aria-describedby={error.value ? 'spec-option-new-err' : undefined}
                  disabled={busy}
                />
                {error.value && (
                  <p id="spec-option-new-err" role="alert" className="text-sm text-destructive">
                    {error.value}
                  </p>
                )}
              </div>
              <Button type="submit" className="sm:mt-6" disabled={busy}>
                {addMut.isPending ? 'Đang thêm...' : 'Thêm'}
              </Button>
            </form>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Thuộc tính nhập tự do, không có danh sách lựa chọn.</p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
